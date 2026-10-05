"""Build whatsapp_scenarios.json (spec §10.9) from real claims in claims.json, so every name, registration, amount, garage, photo and
check result in the replay matches the claim it is based on.

Five journeys: happy path (cashless pre-approval), more information needed, theft claim, flagged claim (customer-safe messages, SIU
only under the hood) and settlement & feedback. Each message carries an `under_the_hood` block (agent, what it checked, latency);
blocks marked `internal` mention risk/fraud and are removed for the customer role by the API.

Usage (from /server):  python scripts/make_whatsapp_scenarios.py      (also called at the end of scripts/seed.py)
"""
from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.json_store import read_json_sync, write_json_sync  # noqa: E402

CHAPTERS = [("fnol", "FNOL"), ("photos", "Photos"), ("verification", "Verification"), ("decision", "Decision"), ("settlement", "Settlement")]


def inr(v: float) -> str:
    """₹1,25,000 (Indian grouping, no paise)."""
    n = str(int(round(v)))
    head, tail = n[:-3], n[-3:]
    while len(head) > 2:
        tail = head[-2:] + "," + tail
        head = head[:-2]
    return "₹" + (head + "," + tail if head else tail)


def peaks(seed: str, n: int = 36) -> list[float]:
    h = hashlib.sha256(seed.encode()).digest()
    return [round(0.25 + (h[i % len(h)] / 255) * 0.75, 2) for i in range(n)]


class Script:
    def __init__(self, claim: dict):
        self.c = claim
        self.t = datetime.fromisoformat(claim["incident"]["reported_at"]) - timedelta(minutes=6)
        self.msgs: list[dict] = []

    def at(self, minutes: float = 0.4) -> str:
        self.t += timedelta(minutes=minutes)
        return self.t.isoformat(timespec="seconds")

    def add(self, sender: str, kind: str, chapter: str, uth: dict | None = None, gap: float = 0.4, **payload) -> None:
        self.msgs.append({"id": f"w{len(self.msgs) + 1}", "from": sender, "type": kind, "chapter": chapter, "ts": self.at(gap),
                          **payload, "under_the_hood": uth})

    def check(self, key: str) -> dict:
        ch = self.c["checks"][key]
        return {"name": {"policy": "Policy core", "vahan": "Vahan (RTO)", "dl": "Sarathi DL", "fastag": "NPCI FASTag", "iib": "IIB history",
                         "police": "Police records", "kyc": "CKYC"}[key], "result": ch["summary"], "level": ch["level"], "latency_ms": ch["latency_ms"]}

    def photos(self) -> list[dict]:
        return [{"url": m["url"], "thumb": m.get("thumb"), "blur_data": m.get("blur_data")} for m in self.c["media"] if m["kind"] == "photo"]


def uth(agent: str | None, title: str, *, tools=(), notes=(), latency_ms: int | None = None, internal: bool = False) -> dict:
    return {"agent": agent, "title": title, "tools": list(tools), "notes": list(notes), "latency_ms": latency_ms, "internal": internal}


def opening(s: Script, greeting: str) -> None:
    c = s.c
    s.add("customer", "text", "fnol", text=greeting, gap=0)
    s.add("business", "list", "fnol", uth(None, "Business account menu", notes=["Verified business profile · auto-reply in < 1 s"], latency_ms=320),
          text=f"Namaste {c['customer_name'].split()[0]}! I'm the ABC claims assistant. What would you like to do?", button="Choose an option",
          rows=[{"title": "Report a new claim", "description": "Accident, theft, glass, flood"}, {"title": "Track a claim", "description": "Status and next steps"},
                {"title": "Talk to an expert", "description": "Mon–Sat, 9 AM–7 PM"}], chosen="Report a new claim")
    s.add("customer", "text", "fnol", text="Report a new claim", gap=0.2)
    s.add("business", "quick_replies", "fnol", uth("intake", "Policy lookup by phone number", tools=[s.check("policy")], latency_ms=c["checks"]["policy"]["latency_ms"]),
          text=f"I found your policy for {c['vehicle']['make']} {c['vehicle']['model']} · {c['registration']}. Is this the vehicle?",
          buttons=["Yes, this one", "Another vehicle"], chosen="Yes, this one")
    s.add("customer", "text", "fnol", text="Yes, this one", gap=0.2)


def voice_fnol(s: Script, prompt: str = "Tell me what happened — type it or send a voice note in any language.") -> None:
    c = s.c
    i = c["incident"]
    audio = next((m for m in c["media"] if m["kind"] == "audio"), {})
    s.add("business", "text", "fnol", None, text=prompt)
    s.add("customer", "voice", "fnol", uth("intake", "Voice note transcribed and structured", tools=[
        {"name": "Speech-to-text", "result": f"Detected {audio.get('language') or i['narrative_language']}", "level": "pass", "latency_ms": 2100},
        {"name": "Translate + extract", "result": f"{i['label']} · {i['location']['text']} · {', '.join(i['damaged_parts_mentioned'][:3])}", "level": "pass", "latency_ms": 1700}],
        latency_ms=3800), duration_s=audio.get("duration_s") or 14, peaks=peaks(c["id"]), transcript=i["narrative_original"],
        translation=i["narrative_en"], gap=1.2)


def location(s: Script) -> None:
    loc = s.c["incident"]["location"]
    s.add("business", "quick_replies", "fnol", uth("intake", "Missing field: incident location", notes=["Asks only for what the statement did not contain"], latency_ms=900),
          text="Thanks. Please share the location where it happened.", buttons=["Send location", "Type the address"], chosen="Send location")
    s.add("customer", "location", "fnol", uth("intake", "Location geocoded", tools=[{"name": "Geocoder", "result": f"{loc['text']}, {loc['city']} ({loc['lat']:.4f}, {loc['lng']:.4f})", "level": "pass", "latency_ms": 240}], latency_ms=240),
          label=loc["text"], address=f"{loc['text']}, {loc['city']}", lat=loc["lat"], lng=loc["lng"])


def photo_round(s: Script, ask: str) -> None:
    c = s.c
    s.add("business", "text", "photos", None, text=ask)
    items = c.get("damage", {}).get("items", [])
    s.add("customer", "images", "photos", uth("damage", "Damage assessed from the photos", tools=[
        {"name": "Photo quality", "result": "Sharp, well lit, EXIF time and GPS present", "level": "pass", "latency_ms": 180},
        {"name": "Vehicle identity", "result": f"{c['vehicle']['make']} {c['vehicle']['model']}, {c['vehicle']['colour']} — matches the policy", "level": "pass", "latency_ms": 2600},
        {"name": "Parts and severity", "result": ", ".join(f"{x.get('part', x.get('part_code'))} ({x.get('operation')})" for x in items[:3]) or "Assessed", "level": "pass", "latency_ms": 9800}],
        latency_ms=12600), images=s.photos(), gap=2)


def doc_round(s: Script, docs: list[str]) -> None:
    for d in s.c["documents"]:
        if d["type"] in docs and d.get("url"):
            s.add("customer", "document", "verification", uth("document", f"{d['type']} read and matched", tools=[
                {"name": "Document AI", "result": "; ".join(ch["message"] for ch in d.get("checks", [])[:2]) or "Fields extracted", "level": "pass", "latency_ms": 2400}],
                latency_ms=2400), name=f"{d['type']}_{s.c['registration'].replace(' ', '')}.pdf", pages=1, size_kb=180 + len(d["type"]) * 7, thumb=d.get("thumb"), gap=0.6)


def verification(s: Script, keys=("vahan", "dl", "fastag", "iib", "kyc"), internal_fail: bool = False) -> None:
    tools = [s.check(k) for k in keys if k in s.c["checks"]]
    failing = any(t["level"] == "fail" for t in tools)
    s.add("business", "status", "verification", uth("verification", "Checks against India's digital public infrastructure", tools=tools,
          latency_ms=sum(t["latency_ms"] for t in tools), internal=internal_fail and failing),
          title="Claim registered", claim_id=s.c["id"], steps=[{"label": "Claim registered", "state": "done"}, {"label": "Vehicle & documents checked", "state": "done"},
                                                               {"label": "Damage assessed", "state": "done"}, {"label": "Decision", "state": "current"}])


def scenario(key: str, title: str, short: str, description: str, s: Script) -> dict:
    c = s.c
    used = {m["chapter"] for m in s.msgs}
    return {"id": key, "title": title, "short": short, "description": description, "claim_id": c["id"], "customer_id": c["customer_id"],
            "customer_name": c["customer_name"], "vehicle": f"{c['vehicle']['make']} {c['vehicle']['model']}", "registration": c["registration"],
            "language": c["incident"]["narrative_language"],
            "chapters": [{"key": k, "label": label, "index": next(i for i, m in enumerate(s.msgs) if m["chapter"] == k)} for k, label in CHAPTERS if k in used],
            "messages": s.msgs}


def happy_path(c: dict) -> dict:
    s = Script(c)
    fin = c["financials"]
    opening(s, "Hi, mujhe claim karna hai")
    voice_fnol(s)
    location(s)
    photo_round(s, "Got it. Please send 2–4 photos: the full rear of the car and a close-up of the damage.")
    doc_round(s, ["RC", "DL"])
    verification(s)
    s.add("business", "template", "decision", uth("adjudication", "Straight-through decision", tools=[
        {"name": "Costing (Python)", "result": f"Assessed {inr(fin['assessed_loss'])} − deductible {inr(fin['compulsory_deductible'])} = {inr(fin['net_payable'])}", "level": "pass", "latency_ms": 40},
        {"name": "Policy terms", "result": "All checks passed · auto-approval within limits", "level": "pass", "latency_ms": 60}], latency_ms=900),
        header="Cashless repair approved ✓", body=f"Claim {c['id']} for {c['registration']} is pre-approved for {inr(c['amount_approved'])} at {c['garage_name']}.",
        footer="ABC General Insurance · Motor Claims", buttons=["Book drop-off", "Get directions", "Talk to us"], gap=1)
    s.add("customer", "text", "decision", text="Wah, itna jaldi! Thank you 🙏", gap=1)
    s.add("business", "text", "decision", uth("communication", "Reply in the customer's language", notes=["Hinglish detected from the voice note"], latency_ms=1100),
          text="Aapka swagat hai! Garage ko details bhej di gayi hain. Repair ke updates yahin milte rahenge.")
    return scenario("happy_path", "Happy path", "Cashless approved", "Voice-note FNOL in Hinglish, photos and documents read live, straight-through cashless approval.", s)


def more_info(c: dict) -> dict:
    s = Script(c)
    items = c["decision"]["info_request"]["items"]
    opening(s, "Hi, my windshield cracked")
    s.add("business", "text", "fnol", None, text="Sorry to hear that. Briefly, what happened?")
    s.add("customer", "text", "fnol", uth("intake", "Statement structured", tools=[{"name": "Extract", "result": f"{c['incident']['label']} · {c['incident']['location']['text']}", "level": "pass", "latency_ms": 1600}], latency_ms=1600),
          text=c["incident"]["narrative_original"], gap=0.8)
    photo_round(s, "Please send a photo of the windshield from outside and one close-up of the crack.")
    verification(s)
    s.add("business", "template", "decision", uth("adjudication", "Information needed before a decision", tools=[
        {"name": "Document checklist", "result": "Missing: " + ", ".join(items), "level": "warn", "latency_ms": 70}], latency_ms=800),
        header="We need 2 more things", body="To finish your claim, please send:\n• " + "\n• ".join(items), footer="Reply here — it takes a minute", buttons=["Send now", "Remind me later"], gap=1)
    s.add("customer", "text", "decision", text="Sending now", gap=3)
    s.add("customer", "document", "decision", uth("document", "Odometer photo read", tools=[{"name": "Document AI", "result": "Odometer reading captured · readable", "level": "pass", "latency_ms": 1900}], latency_ms=1900),
          name="Odometer.jpg", pages=1, size_kb=410, gap=0.5)
    s.add("customer", "document", "decision", uth("document", "Garage estimate read", tools=[
        {"name": "Document AI", "result": f"Estimate {inr(c['financials']['garage_quote'])} from {c['garage_name']}", "level": "pass", "latency_ms": 2300},
        {"name": "Costing (Python)", "result": f"AI estimate {inr(c['financials']['assessed_loss'])} · quote within 5%", "level": "pass", "latency_ms": 50}], latency_ms=2350),
          name="Estimate_Windshield.pdf", pages=2, size_kb=240)
    s.add("business", "status", "decision", uth("communication", "Status update", latency_ms=700), title="All documents received", claim_id=c["id"],
          steps=[{"label": "Claim registered", "state": "done"}, {"label": "Documents received", "state": "done"}, {"label": "Final review", "state": "current"}, {"label": "Repair", "state": "todo"}])
    return scenario("more_info", "More info needed", "Info requested", "The assistant asks only for what is missing, then confirms receipt — no phone calls.", s)


def theft(c: dict) -> dict:
    s = Script(c)
    items = c["decision"]["info_request"]["items"]
    fir = c["checks"]["police"]["summary"]
    opening(s, "मेरी एक्टिवा चोरी हो गई")
    voice_fnol(s, "I'm sorry. Please tell me what happened — a voice note in Hindi is fine.")
    location(s)
    s.add("business", "text", "verification", None, text="Please send the FIR copy and the RC.")
    doc_round(s, ["FIR", "RC"])
    s.add("business", "status", "verification", uth("verification", "Theft checks", tools=[s.check("police"), s.check("vahan"), s.check("iib")],
          notes=["Late intimation (more than 48 h after the theft) noted for the handler"], latency_ms=900, internal=True),
          title="FIR verified", claim_id=c["id"], steps=[{"label": "Claim registered", "state": "done"}, {"label": "FIR verified", "state": "done"},
                                                        {"label": "Originals", "state": "current"}, {"label": "Settlement", "state": "todo"}])
    s.add("business", "template", "decision", uth("adjudication", "Theft claims go to a handler", tools=[{"name": "Policy terms", "result": f"IDV-based settlement · {fir}", "level": "pass", "latency_ms": 50}],
          notes=["Theft claims are never auto-approved"], latency_ms=700),
          header="Next steps for your theft claim", body="Please hand over at our Pimpri branch:\n• " + "\n• ".join(items) + "\nWe settle on the insured value once these are received.",
          footer="ABC General Insurance · Motor Claims", buttons=["Branch address", "Book a visit"], gap=1)
    s.add("customer", "text", "decision", text="ठीक है, कल ब्रांच आऊँगा", gap=1)
    return scenario("theft", "Theft claim", "Two-wheeler theft", "Hindi voice note, FIR verified against police records, clear list of originals to hand over.", s)


def flagged(c: dict) -> dict:
    s = Script(c)
    fraud = c["fraud"]
    opening(s, "Hi, I had an accident last night")
    voice_fnol(s)
    location(s)
    photo_round(s, "Please send photos of the front of the car and a close-up of the damage.")
    s.msgs[-1]["under_the_hood"] = uth("damage", "Damage assessed — inconsistencies found", tools=[
        {"name": "Vehicle identity", "result": f"{c['vehicle']['make']} {c['vehicle']['model']} — matches the policy", "level": "pass", "latency_ms": 2600},
        {"name": "Fresh vs old damage", "result": "Oxidised fracture edges on the bumper bracket — pre-existing", "level": "fail", "latency_ms": 9400}],
        latency_ms=12000, internal=True)
    verification(s, internal_fail=True)
    s.add("business", "text", "decision", uth("fraud", f"Risk score {fraud['score']} ({fraud['band']}) → SIU", tools=[
        {"name": f["rule_id"], "result": f["evidence"], "level": f["level"], "latency_ms": 5} for f in fraud["fired"]],
        notes=["The customer only sees neutral, customer-safe wording"], latency_ms=4200, internal=True),
        text=f"Thank you. We're doing some additional verification on claim {c['id']} and will update you within 2 working days.", gap=1)
    safe = next((f["customer_safe_reason"] for f in fraud["fired"] if f.get("customer_safe_reason")), "Could you share a little more detail?")
    s.add("business", "quick_replies", "decision", uth("communication", "Customer-safe follow-up question", notes=["Generated from the fired rules, never mentions them"], latency_ms=1300, internal=True),
          text=safe, buttons=["Share details", "Call me"], chosen="Share details")
    s.add("customer", "text", "decision", text="I was coming back from Lonavala, no one else was there.", gap=2)
    s.add("business", "text", "decision", uth("communication", "Acknowledgement", latency_ms=600), text="Thanks, noted. Our team will contact you if anything else is needed.")
    return scenario("flagged", "Flagged claim", "Additional verification", "The customer sees calm, neutral messages; the risk findings and SIU referral stay under the hood.", s)


def settlement(c: dict) -> dict:
    s = Script(c)
    fin = c["financials"]
    paid = next(e["ts"] for e in c["timeline"] if e["type"] == "settled")
    s.t = datetime.fromisoformat(paid) - timedelta(minutes=30)
    s.add("business", "status", "settlement", uth("communication", "Repair complete update from the garage", tools=[{"name": "Garage portal", "result": f"{c['garage_name']} marked the repair complete", "level": "pass", "latency_ms": 300}], latency_ms=300),
          title="Your car is ready", claim_id=c["id"], steps=[{"label": "Claim approved", "state": "done"}, {"label": "Repair", "state": "done"},
                                                              {"label": "Payment to garage", "state": "current"}, {"label": "Feedback", "state": "todo"}], gap=0)
    s.t = datetime.fromisoformat(paid)
    s.add("business", "payment", "settlement", uth("adjudication", "Settlement released", tools=[
        {"name": "Costing (Python)", "result": f"Assessed {inr(fin['assessed_loss'])} − deductible {inr(fin['compulsory_deductible'])} = {inr(fin['net_payable'])}", "level": "pass", "latency_ms": 40},
        {"name": "Payments", "result": f"NEFT to {c['garage_name']} · UTR SBIN{c['id'][-6:]}4471", "level": "pass", "latency_ms": 900}], latency_ms=940),
        amount=c["amount_approved"], payee=c["garage_name"], mode="Cashless · NEFT to garage", reference=f"SBIN{c['id'][-6:]}4471",
        you_pay=fin["compulsory_deductible"], gap=0)
    s.add("customer", "text", "settlement", text="Gaadi mil gayi, kaam badhiya hua 👍", gap=50)
    s.add("business", "rating", "settlement", uth("communication", "Feedback request", latency_ms=500), text="Glad to hear it! How was your claim experience?", stars=5,
          comment="Fast and easy, no paperwork", gap=0.3)
    s.add("business", "text", "settlement", uth("communication", "Closing message", notes=["NPS captured to the claim"], latency_ms=400),
          text=f"Thank you, {c['customer_name'].split()[0]}! Claim {c['id']} is now closed. Drive safe 🚗", gap=0.5)
    return scenario("settlement", "Settlement & feedback", "Paid & rated", "Garage marks the repair done, payment is released with a reference, and the customer rates the service.", s)


SOURCES = [("happy_path", "clean_rear_end", happy_path), ("more_info", "ABC-MC-2026-000230", more_info), ("theft", "theft_two_wheeler", theft),
           ("flagged", "fastag_mismatch", flagged), ("settlement", "ABC-MC-2026-000190", settlement)]


def build(claims: list[dict]) -> list[dict]:
    by_id = {c["id"]: c for c in claims}
    by_scenario = {c["scenario_id"]: c for c in claims if c.get("scenario_id")}
    out = []
    for _key, src, fn in SOURCES:
        claim = by_scenario.get(src) or by_id.get(src)
        if claim:
            out.append(fn(claim))
    return out


def main() -> None:
    scenarios = build(read_json_sync("claims.json", []))
    write_json_sync("whatsapp_scenarios.json", scenarios)
    print(f"whatsapp_scenarios.json: {len(scenarios)} scenarios, {sum(len(s['messages']) for s in scenarios)} messages")


if __name__ == "__main__":
    main()
