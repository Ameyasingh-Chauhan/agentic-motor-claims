"""Specimen claim documents rendered from each claim's own data (spec §18).

Every document is drawn from the exact `extracted` fields stored on the claim's document record, so the image and
the extracted data can never disagree. Layouts are deliberately generic (no imitation of any government card
design) and every page carries a diagonal "SAMPLE – NOT VALID" watermark. No Aadhaar or PAN images are produced:
KYC is shown in the app as a masked verification card only.

    python scripts/make_specimen_docs.py            # re-render every claim's documents from claims.json

The seed calls `render_claim(claim)` directly. Output: client/public/assets/documents/<claim_id>/<doc_id>.webp
(+ <doc_id>-thumb.webp). Writes go to a temp folder that is swapped in when complete.
"""
from __future__ import annotations

import shutil
import sys
from datetime import date, datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SERVER = Path(__file__).resolve().parents[1]
ROOT = SERVER.parent
sys.path.insert(0, str(SERVER))
from app.services.json_store import read_json_sync  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fs_sync import sync_dir  # noqa: E402

OUT = ROOT / "client" / "public" / "assets" / "documents"
FONTS = Path(__file__).resolve().parent / "assets" / "fonts"
INSURER = "ABC General Insurance"

INK, MUTED, RULE, PAPER, BAND = (17, 24, 39), (85, 94, 110), (209, 213, 219), (253, 253, 251), (241, 243, 246)
ACCENT = {"RC": (37, 99, 235), "DL": (13, 148, 136), "Policy": (234, 88, 12), "FIR": (71, 85, 105),
          "Estimate": (124, 58, 237), "Invoice": (22, 163, 74), "TaxReceipt": (100, 116, 139)}

TITLES = {
    "RC": ("Certificate of Registration", "Motor vehicle registration record (specimen)"),
    "DL": ("Driving Licence", "Licence to drive motor vehicles (specimen)"),
    "Policy": ("Motor Policy Schedule", f"{INSURER} · Certificate of insurance cum policy schedule"),
    "FIR": ("First Information Report", "Under section 173 BNSS (specimen extract)"),
    "Estimate": ("Repair Estimate", "Pre-repair estimate submitted by workshop"),
    "Invoice": ("Final Repair Invoice", "Tax invoice for repairs carried out"),
    "TaxReceipt": ("Road Tax Receipt", "Motor vehicle tax payment acknowledgement (specimen)"),
}

LABELS = {
    "registration": "Registration no.", "owner": "Registered owner", "address": "Address", "make_model": "Maker / model",
    "variant": "Variant", "fuel": "Fuel", "cc": "Cubic capacity", "colour": "Colour", "chassis": "Chassis no.", "engine": "Engine no.",
    "registered_on": "Date of registration", "authority": "Registering authority", "vehicle_class": "Vehicle class",
    "hypothecation": "Hypothecated to", "rc_valid_to": "Registration valid till",
    "dl_number": "Licence no.", "holder": "Name of holder", "dob": "Date of birth", "classes": "Class of vehicle",
    "valid_from": "Valid from", "valid_to": "Valid till (non-transport)", "issued_by": "Licensing authority",
    "policy_no": "Policy no.", "product": "Product", "insured": "Insured", "vehicle": "Vehicle", "period": "Period of insurance",
    "idv": "Insured declared value (IDV)", "ncb": "No claim bonus", "add_ons": "Add-on covers", "compulsory_deductible": "Compulsory deductible",
    "voluntary_deductible": "Voluntary deductible", "premium": "Total premium (incl. GST)", "cover": "Cover",
    "fir_number": "FIR no.", "station": "Police station", "date": "Date of report", "complainant": "Complainant",
    "incident_at": "Date & time of occurrence", "place": "Place of occurrence", "facts": "Brief facts",
    "garage": "Workshop", "estimate_no": "Estimate no.", "invoice_no": "Invoice no.", "claim_id": "Claim reference",
    "total": "Total", "receipt_no": "Receipt no.", "tax_period": "Tax paid up to", "amount": "Amount paid",
}

_font_cache: dict[tuple, ImageFont.FreeTypeFont] = {}


def font(size: int, weight: int = 400, mono: bool = False) -> ImageFont.FreeTypeFont:
    key = (size, weight, mono)
    if key not in _font_cache:
        if mono:
            f = ImageFont.truetype(str(FONTS / "jetbrains-mono-latin-400-normal.woff2"), size)
        else:
            f = ImageFont.truetype(str(FONTS / "inter-latin-wght-normal.woff2"), size)
            f.set_variation_by_axes([weight])
        _font_cache[key] = f
    return _font_cache[key]


def fmt_date(value: str | None) -> str:
    if not value:
        return "—"
    try:
        d = datetime.fromisoformat(value) if "T" in value else datetime.combine(date.fromisoformat(value), datetime.min.time())
    except ValueError:
        return value
    return d.strftime("%d %b %Y %I:%M %p").replace(" 12:00 AM", "") if "T" in value else d.strftime("%d %b %Y")


def inr(n) -> str:
    n = int(round(float(n)))
    s = str(abs(n))
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ("-" if n < 0 else "") + "Rs. " + ",".join(groups + [tail]) if groups else ("-" if n < 0 else "") + "Rs. " + tail


def display(key: str, value) -> str:
    if value is None or value == "" or value == []:
        return "—"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    if key in ("idv", "premium", "total", "amount", "compulsory_deductible", "voluntary_deductible"):
        return inr(value)
    if key in ("registered_on", "valid_from", "valid_to", "dob", "date", "rc_valid_to", "tax_period"):
        return fmt_date(str(value))
    if key == "incident_at":
        return fmt_date(str(value))
    if key == "cc":
        return f"{value} cc"
    if key == "ncb":
        return f"{value}%"
    return str(value)


def wrap(draw: ImageDraw.ImageDraw, text: str, f, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + ([line] if line else [])


def watermark(im: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    text = "SAMPLE – NOT VALID"
    f = font(int(im.width * 0.085), 800)
    w = int(ImageDraw.Draw(layer).textlength(text, font=f))
    stamp = Image.new("RGBA", (w + 40, int(im.width * 0.12)), (0, 0, 0, 0))
    ImageDraw.Draw(stamp).text((20, 0), text, font=f, fill=(220, 38, 38, 70))
    stamp = stamp.rotate(28, expand=True, resample=Image.Resampling.BICUBIC)
    layer.alpha_composite(stamp, ((im.width - stamp.width) // 2, (im.height - stamp.height) // 2))
    return Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")


def render(doc: dict, claim_id: str) -> Image.Image:
    """Draw one document. `doc` = {type, extracted: {...}, lines?: [...], tampered_field?: str}."""
    kind = doc["type"]
    fields: dict = doc["extracted"]
    card = kind in ("RC", "DL")
    W, H = (1400, 780 if kind == "DL" else 880) if card else (1240, 1640)
    accent = ACCENT.get(kind, ACCENT["Policy"])
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    pad = 56
    d.rectangle((0, 0, W, 14), fill=accent)
    d.rectangle((pad - 24, 40, W - pad + 24, H - 40), outline=RULE, width=2)
    title, sub = TITLES[kind]
    issuer = INSURER if kind in ("Policy",) else (fields.get("garage") if kind in ("Estimate", "Invoice") else
                                                  "Specimen issuing authority" if kind != "FIR" else fields.get("station", "Police station"))
    d.text((pad, 70), str(issuer).upper(), font=font(22, 600), fill=accent)
    d.text((pad, 104), title, font=font(46, 700), fill=INK)
    d.text((pad, 162), sub, font=font(22), fill=MUTED)
    ref = fields.get("registration") or fields.get("dl_number") or fields.get("policy_no") or fields.get("fir_number") or \
        fields.get("estimate_no") or fields.get("invoice_no") or fields.get("receipt_no") or ""
    if ref:
        tw = d.textlength(str(ref), font=font(30, mono=True))
        d.rounded_rectangle((W - pad - tw - 40, 84, W - pad, 140), radius=10, fill=BAND)
        d.text((W - pad - tw - 20, 94), str(ref), font=font(30, mono=True), fill=INK)
    y = 218
    d.line((pad, y, W - pad, y), fill=RULE, width=2)
    y += 28

    skip = {"garage", "facts"} | ({"total"} if doc.get("lines") else set())
    keys = [k for k in fields if k in LABELS and k not in skip]
    x_photo = None
    if kind == "DL":  # generic initials tile instead of a photo
        x_photo = W - pad - 200
        d.rounded_rectangle((x_photo, y, x_photo + 200, y + 240), radius=12, fill=BAND, outline=RULE, width=2)
        initials = "".join(p[0] for p in str(fields.get("holder", "?")).split()[:2]).upper()
        f = font(72, 600)
        d.text((x_photo + 100 - d.textlength(initials, font=f) / 2, y + 70), initials, font=f, fill=MUTED)
    cols = 1 if not card else 2
    col_w = ((x_photo - pad - 24) if x_photo else (W - 2 * pad)) // cols
    row_h = 74 if card else 64
    for i, key in enumerate(keys):
        cx = pad + (i % cols) * col_w if card else pad
        cy = y + (i // cols) * row_h if card else y
        tampered = doc.get("tampered_field") == key
        label_f, value_f = font(19, 500), font(27 if card else 26, 600, mono=key in ("registration", "chassis", "engine", "dl_number", "policy_no"))
        d.text((cx, cy), LABELS[key].upper(), font=label_f, fill=MUTED)
        value = display(key, fields[key])
        if card:
            vy = cy + 26
            if tampered:  # visible tampering cue: a pasted-over patch with a mismatched font, slightly off baseline
                tw = d.textlength(value, font=font(29, 400, mono=True))
                d.rectangle((cx - 4, vy - 2, cx + tw + 8, vy + 36), fill=(250, 250, 244))
                d.text((cx + 3, vy + 4), value, font=font(29, 400, mono=True), fill=(40, 40, 60))
            else:
                d.text((cx, vy), value, font=value_f, fill=INK)
        else:
            vx = pad + 380
            lines = wrap(d, value, value_f, W - pad - vx)
            for j, ln in enumerate(lines):
                d.text((vx, cy - 4 + j * 34), ln, font=value_f, fill=INK)
            y += max(row_h, 34 * len(lines) + 24)
            d.line((pad, y - 14, W - pad, y - 14), fill=BAND, width=2)
    if card:
        y += ((len(keys) + cols - 1) // cols) * row_h

    if fields.get("facts"):
        y += 12
        d.text((pad, y), LABELS["facts"].upper(), font=font(19, 500), fill=MUTED)
        y += 34
        for ln in wrap(d, str(fields["facts"]), font(25), W - 2 * pad)[:8]:
            d.text((pad, y), ln, font=font(25), fill=INK)
            y += 36

    if doc.get("lines"):
        y += 20
        heads = [("Part / operation", pad), ("Qty", W - pad - 470), ("Parts", W - pad - 360), ("Labour", W - pad - 230), ("Amount", W - pad - 110)]
        d.rectangle((pad, y, W - pad, y + 46), fill=BAND)
        for h, x in heads:
            d.text((x + 10 if x == pad else x, y + 12), h, font=font(20, 600), fill=MUTED)
        y += 58
        for ln in doc["lines"]:
            d.text((pad + 10, y), f"{ln['description']} · {ln['operation'].replace('_', ' ')}"[:48], font=font(22), fill=INK)
            d.text((W - pad - 470, y), "1", font=font(22), fill=INK)
            for val, x in ((ln["parts"], W - pad - 360), (ln["labour"], W - pad - 230), (ln["amount"], W - pad - 110)):
                s = f"{int(round(val)):,}"
                d.text((x + 90 - d.textlength(s, font=font(22, mono=True)), y), s, font=font(22, mono=True), fill=INK)
            y += 40
            d.line((pad, y - 6, W - pad, y - 6), fill=BAND, width=1)
        y += 10
        total = display("total", fields.get("total"))
        d.text((W - pad - 20 - d.textlength(f"Total  {total}", font=font(28, 700)), y), f"Total  {total}", font=font(28, 700), fill=INK)

    foot = f"Specimen generated for demonstration · {claim_id} · not a valid document"
    d.text((pad, H - 86), foot, font=font(18), fill=MUTED)
    return watermark(im)


def save(im: Image.Image, folder: Path, doc_id: str) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    im.save(folder / f"{doc_id}.webp", "WEBP", quality=66, method=6)
    thumb = im.copy()
    thumb.thumbnail((320, 640), Image.Resampling.LANCZOS)
    thumb.save(folder / f"{doc_id}-thumb.webp", "WEBP", quality=70, method=6)
    return {"width": im.width, "height": im.height}


def render_claim(claim: dict, root: Path = OUT) -> list[dict]:
    """Render every renderable document of a claim into root/<claim_id>/, setting url/thumb on each record."""
    folder = root / claim["id"]
    for doc in claim.get("documents", []):
        if doc.get("type") not in TITLES or not doc.get("extracted"):
            continue
        save(render(doc, claim["id"]), folder, doc["id"])
        base = f"/assets/documents/{claim['id']}/{doc['id']}"
        doc["url"], doc["thumb"] = f"{base}.webp", f"{base}-thumb.webp"
    return claim.get("documents", [])


def render_all(claims: list[dict]) -> int:
    """Render into a temp folder and swap it in only when complete (an interruption never leaves a half set)."""
    tmp = OUT.with_name("documents.__building__")
    shutil.rmtree(tmp, ignore_errors=True)
    n = 0
    for c in claims:
        n += len([d for d in render_claim(c, tmp) if d.get("url")])
    sync_dir(tmp, OUT)
    return n


def main() -> None:
    claims = read_json_sync("claims.json", []) or []
    print(f"Rendered {render_all(claims)} documents for {len(claims)} claims into {OUT}")


if __name__ == "__main__":
    main()
