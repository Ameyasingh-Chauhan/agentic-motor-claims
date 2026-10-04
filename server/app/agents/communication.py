"""Agent 7 — Communication (AGENT_PROMPTS.md G). Also used stand-alone by "Regenerate draft" on the Communications tab.

Only customer-safe facts go into the prompt, and every generated text passes `is_customer_safe()` (AGENTS.md rule 5); a text
that mentions internal checks is replaced by the template message."""
from __future__ import annotations

import re

from ..services.claim_detail import message_channel
from ..services.claim_views import now_ist
from .base import RunContext, llm_step
from .schemas import CommunicationOut

PURPOSE_BY_STATUS = {"SUBMITTED": "ack", "PROCESSING": "ack", "INFO_REQUESTED": "info_request", "UNDER_REVIEW": "under_review",
                     "SIU_INVESTIGATION": "under_review", "PREAUTH_ISSUED": "preauth", "APPROVED": "approved", "SETTLED": "settled",
                     "DECLINED": "declined", "FRAUD_CONFIRMED": "declined"}
LANG_LABEL = {"hi-en": "Hinglish (Hindi–English mix, Roman script)", "hi": "Hindi", "mr": "Marathi", "ml": "Malayalam", "ta": "Tamil",
              "te": "Telugu", "kn": "Kannada", "bn": "Bengali", "gu": "Gujarati", "en": "English"}
UNSAFE = re.compile(r"\b(fraud\w*|suspici\w*|risk|score|siu|investigat\w*|fastag|toll data|iib|rule|rules|flagged|blacklist\w*|"
                    r"database|tamper\w*|red flag)\b", re.I)


def is_customer_safe(*texts: str | None) -> bool:
    return not any(t and UNSAFE.search(t) for t in texts)


def inr(n: float) -> str:
    s = str(int(round(n)))
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return "₹" + ",".join(([head] if head else []) + groups + [tail]) if head or groups else "₹" + tail


def safe_facts(claim: dict, *, purpose: str, items: list[str], garage: dict | None) -> str:
    v = claim["vehicle"]
    facts = [f"claim no {claim['id']}", f"vehicle {v['make']} {v['model']} {claim['registration']}"]
    if garage:
        facts.append(f"garage {garage['name']}, {garage['city']}")
    fin = claim.get("financials") or {}
    if purpose in ("preauth", "approved", "settled") and fin.get("net_payable") is not None:
        facts.append(f"approved amount {inr(fin['net_payable'])}")
    if items:
        facts.append("items needed: " + "; ".join(items))
    nxt = {"ack": "our team is reviewing the claim and will update shortly",
           "info_request": "upload the items in the app or reply on WhatsApp; review continues once received",
           "under_review": "a claims specialist is reviewing; update within 2 working days",
           "preauth": "cashless pre-approval sent to the garage; repairs can start; share the final invoice after repair",
           "approved": "payment details will be confirmed after the final invoice",
           "settled": "payment completed", "declined": "the customer can request a review by replying or calling"}[purpose]
    facts.append(f"next steps: {nxt}")
    return " | ".join(facts)


def template(claim: dict, purpose: str, items: list[str], garage: dict | None) -> CommunicationOut:
    first, cid = claim["customer_name"].split()[0], claim["id"]
    fin = claim.get("financials") or {}
    text = {
        "ack": f"Hi {first}, we've received claim {cid}. Our team is reviewing it and will update you shortly.",
        "info_request": f"Hi {first}, to keep claim {cid} moving we need: {', '.join(items) or 'a few documents'}. "
                        "You can upload them in the app or reply here.",
        "under_review": f"Hi {first}, claim {cid} is with our claims team for review. We'll update you within 2 working days.",
        "preauth": f"Hi {first}, good news — cashless pre-approval for claim {cid} has been sent to "
                   f"{(garage or {}).get('name') or 'your garage'}. Repairs can begin.",
        "approved": f"Hi {first}, claim {cid} is approved for {inr(fin.get('net_payable') or 0)}. We'll confirm payment details shortly.",
        "settled": f"Hi {first}, payment for claim {cid} has been completed.",
        "declined": f"Hi {first}, we're sorry — claim {cid} could not be approved. Reply here or call us to request a review.",
    }[purpose]
    return CommunicationOut(message_local=text, message_en=text, lang_code="en", quick_replies=[])


async def compose(ctx: RunContext | None, claim: dict, *, purpose: str, items: list[str], garage: dict | None, customer: dict,
                  run_standalone=None) -> tuple[CommunicationOut, str]:
    """→ (message, source). With ctx the call is part of a pipeline run; without it `run_standalone(variables)` performs it."""
    lang = customer.get("preferred_language") or "en"
    variables = {"name": customer["name"].split()[0], "lang": LANG_LABEL.get(lang, lang), "channel": message_channel(claim),
                 "purpose": purpose, "safe_facts": safe_facts(claim, purpose=purpose, items=items, garage=garage)}
    if ctx is not None:
        out = await llm_step(ctx, agent="communication", prompt="communication", variables=variables, contents=["Write the message now."],
                             schema=CommunicationOut, temperature=0.5, thinking="low",
                             default=lambda: template(claim, purpose, items, garage), max_output_tokens=4096)
        source = ctx.sources.get("communication", "live")
    else:
        out, source = await run_standalone(variables)
    for f in ("message_local", "message_en", "email_subject", "email_local", "email_en"):   # recorded demo text carries a placeholder
        if getattr(out, f):
            setattr(out, f, getattr(out, f).replace("{claim_id}", claim["id"]))
    if not is_customer_safe(out.message_local, out.message_en, out.email_local, out.email_en, out.email_subject):
        return template(claim, purpose, items, garage), "template"
    if claim["id"] not in out.message_en:
        out.message_en = f"{out.message_en} (Claim {claim['id']})"
    return out, source


def message_entry(claim: dict, out: CommunicationOut, *, draft: bool, source: str) -> dict:
    n = max((int(m["id"].split("_")[1]) for m in claim.get("communications", []) if str(m.get("id", "")).startswith("msg_")
             and m["id"].split("_")[1].isdigit()), default=0) + 1
    return {"id": f"msg_{n}" if not draft else f"draft_ai_{n}", "channel": message_channel(claim), "direction": "outbound",
            "status": "draft" if draft else "sent", "draft": draft, "text": out.message_local, "text_en": out.message_en,
            "lang_code": out.lang_code, "quick_replies": out.quick_replies[:3],
            **({"email": {"subject": out.email_subject, "local": out.email_local, "en": out.email_en}} if out.email_subject else {}),
            "created_at": now_ist().isoformat(timespec="seconds"), "by": "agent:communication", "generated_by": source}
