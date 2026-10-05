"""Dashboard datasets (spec §10.5), computed from claims.json at request time (§11.6) — nothing is stored or hard-coded.

Population: listed (non-draft) claims matching the sticky filter bar (vehicle type, claim type, city, channel, garage type) whose
FNOL date falls in the selected range. Two series are dated by the decision instead of the FNOL ("settled / approved" in chart 1 and
the human-override rate in chart 19); their drill-down links carry `date_on=decided`, which the claims list understands.

Every clickable element carries a `link` (list-filter params added to the response's `base_link`), built from the same parameters
`claim_filters` applies — so a segment's count equals the row count of the Home list it opens.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import mean

from . import claim_filters as cf
from .claim_views import BUCKETS, PAID_STATUSES, fraud_saving, fy_start, is_auto, is_decided, is_fraud_detected, listed, ts

PRESETS = {"this_month": "This month", "last_3m": "Last 3 months", "fy": "FY to date", "last_fy": "Last FY", "last_24m": "Last 24 months",
           "custom": "Custom range"}
VEHICLE_LABELS = {"2W": "Two-wheeler", "Car": "Car", "CV": "Commercial"}
CHANNEL_LABELS = {"whatsapp": "WhatsApp", "app": "App", "web": "Web", "branch": "Branch"}
GARAGE_TYPE_LABELS = {"authorised": "Authorised dealer", "multibrand": "Multi-brand", "none": "No garage"}
CLAIM_TYPES = ["OD", "TP", "Theft", "Total loss", "Glass"]
BANDS = [("low", "Low risk"), ("medium", "Medium risk"), ("high", "High risk")]
RISK_BINS = [(0, 9), (10, 19), (20, 29), (30, 39), (40, 49), (50, 59), (60, 70), (71, 80), (81, 90), (91, 100)]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
AGENTS = [("intake", "Intake", "intake_complete"), ("document", "Document", "documents_read"), ("verification", "Verification", "checks_complete"),
          ("damage", "Damage", "damage_assessed"), ("fraud", "Fraud", "risk_scored"), ("adjudication", "Adjudication", "recommendation"),
          ("communication", "Communication", "customer_notified")]


# ---------------------------------------------------------------- period & buckets

def _months_back(d: date, months: int) -> date:
    y, m = divmod(d.year * 12 + d.month - 1 - months, 12)
    m += 1
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last))


def resolve_period(preset: str | None, date_from: str | None, date_to: str | None, now: datetime) -> dict:
    today = now.date()
    fy = fy_start(now).date()
    preset = preset if preset in PRESETS else ("custom" if date_from or date_to else "fy")
    if preset == "this_month":
        lo, hi = today.replace(day=1), today
    elif preset == "last_3m":
        lo, hi = _months_back(today, 3) + timedelta(days=1), today
    elif preset == "last_fy":
        lo, hi = date(fy.year - 1, 4, 1), fy - timedelta(days=1)
    elif preset == "last_24m":
        lo, hi = _months_back(today, 24) + timedelta(days=1), today
    elif preset == "custom":
        lo = date.fromisoformat(date_from) if date_from else fy
        hi = date.fromisoformat(date_to) if date_to else today
        if lo > hi:
            lo, hi = hi, lo
    else:
        lo, hi = fy, today
    days = (hi - lo).days + 1
    prior_hi = lo - timedelta(days=1)
    prior_lo = prior_hi - timedelta(days=days - 1)
    return {"preset": preset, "label": PRESETS[preset], "from": lo.isoformat(), "to": hi.isoformat(), "days": days,
            "prior_from": prior_lo.isoformat(), "prior_to": prior_hi.isoformat(), "delta_label": f"vs previous {days} days"}


def buckets_for(lo: date, hi: date) -> tuple[str, list[dict]]:
    days = (hi - lo).days + 1
    out = []
    if days <= 31:
        unit = "day"
        for i in range(days):
            d = lo + timedelta(days=i)
            out.append({"from": d, "to": d, "label": d.strftime("%d %b")})
    elif days <= 120:
        unit = "week"
        d = lo
        while d <= hi:
            end = min(d + timedelta(days=6), hi)
            out.append({"from": d, "to": end, "label": d.strftime("%d %b")})
            d = end + timedelta(days=1)
    else:
        unit = "month"
        d = lo
        while d <= hi:
            nxt = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
            end = min(nxt - timedelta(days=1), hi)
            out.append({"from": d, "to": end, "label": d.strftime("%b ’%y")})
            d = nxt
    return unit, [{"key": b["from"].isoformat(), "label": b["label"], "from": b["from"].isoformat(), "to": b["to"].isoformat()} for b in out]


def _bucket_index(buckets: list[dict]):
    starts = [b["from"] for b in buckets]

    def idx(day: str | None) -> int | None:
        if not day or day < starts[0] or day > buckets[-1]["to"]:
            return None
        lo, hi = 0, len(starts) - 1
        while lo < hi:  # last bucket whose start <= day
            mid = (lo + hi + 1) // 2
            if starts[mid] <= day:
                lo = mid
            else:
                hi = mid - 1
        return lo
    return idx


# ---------------------------------------------------------------- helpers

def _tat_h(c: dict) -> float:
    return (ts(c["decision"]["decided_at"]) - ts(c["created_at"])).total_seconds() / 3600


def _pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _change(cur: float, prev: float) -> float | None:
    if not prev:
        return None
    return round((cur - prev) / prev * 100, 1)


def _inr(v: float) -> str:
    v = round(v)
    if abs(v) >= 1e7:
        return f"₹{v / 1e7:.1f} Cr"
    if abs(v) >= 1e5:
        return f"₹{v / 1e5:.1f} L"
    if abs(v) >= 1e3:
        return f"₹{v / 1e3:.1f} K"
    return f"₹{v:,}"


def _hours(h: float) -> str:
    if h < 1:
        return f"{max(1, round(h * 60))} min"
    return f"{h:.1f} h" if h < 48 else f"{h / 24:.1f} days"


def _trend(change: float | None, what: str, period_days: int) -> str:
    if change is None:
        return f"No {what} in the previous {period_days} days to compare"
    if abs(change) < 0.5:
        return f"{what.capitalize()} flat vs previous {period_days} days"
    return f"{what.capitalize()} {'up' if change > 0 else 'down'} {abs(change):.0f}% vs previous {period_days} days"


class _Totals:
    """Headline numbers for one population (current or prior period) — shared by KPIs, insights and the Home cross-check."""

    def __init__(self, claims: list[dict]):
        self.claims = claims
        self.count = len(claims)
        self.paid = [c for c in claims if c["status"] in PAID_STATUSES]
        self.approved = sum(c["amount_approved"] for c in self.paid)
        self.claimed = sum(c["amount_claimed"] for c in claims)
        self.avg_claim = self.claimed / self.count if self.count else 0.0
        self.fraud = sum(1 for c in claims if is_fraud_detected(c))
        self.fraud_rate = _pct(self.fraud, self.count)
        self.savings = sum(fraud_saving(c) for c in claims)
        self.decided = [c for c in claims if is_decided(c)]
        self.auto = sum(1 for c in self.decided if is_auto(c))
        self.stp = _pct(self.auto, len(self.decided))
        self.tat = mean(_tat_h(c) for c in self.decided) if self.decided else 0.0


# ---------------------------------------------------------------- agent performance (pipeline_runs.json + audit)

def agent_performance(claims: list[dict], runs: list[dict]) -> dict:
    by_run = {r["id"]: r for r in runs if r.get("agents")}
    samples: dict[str, list[tuple[float, bool]]] = defaultdict(list)
    live = historical = 0
    for c in claims:
        run = by_run.get(c.get("pipeline_run_id") or "")
        if run:  # a run recorded by the Phase 5 orchestrator: real per-agent latency and source (fallback = failed step)
            live += 1
            for key, _label, _event in AGENTS:
                a = run["agents"].get(key)
                if a and a.get("duration_ms") is not None:
                    samples[key].append((a["duration_ms"] / 1000, a.get("source") != "fallback"))
            continue
        steps = {e["type"]: ts(e["ts"]) for e in c.get("timeline", [])}
        if "intake_complete" not in steps:
            continue
        historical += 1
        failed = {a["actor"].split(":", 1)[1] for a in c.get("audit", []) if a.get("action") == "agent_fallback"}
        prev = steps.get("fnol_received") or ts(c["created_at"])
        for key, _label, event in AGENTS:
            t = steps.get(event)
            if t is None:
                continue
            samples[key].append((max(0.0, (t - prev).total_seconds()), key not in failed))
            prev = t
    rows = []
    for key, label, _event in AGENTS:
        s = samples.get(key, [])
        rows.append({"key": key, "label": label, "runs": len(s), "avg_latency_s": round(mean(x for x, _ in s), 1) if s else None,
                     "success_rate": _pct(sum(1 for _, ok in s if ok), len(s)) if s else None})
    return {"agents": rows, "live_runs": live, "historical_runs": historical}


# ---------------------------------------------------------------- main

def compute(all_claims: list[dict], params: dict, ctx: cf.Context, runs: list[dict], rules: list[dict], now: datetime) -> dict:
    claims = listed(all_claims)
    period = resolve_period(params.get("range"), params.get("from"), params.get("to"), now)
    flt = {k: params.get(k) or "" for k in cf.DASHBOARD_FILTERS}
    scoped = cf.apply(claims, flt, ctx)                                      # every filter except the date range
    cur = cf.apply(scoped, {"from": period["from"], "to": period["to"]}, ctx)
    prior = cf.apply(scoped, {"from": period["prior_from"], "to": period["prior_to"]}, ctx)
    T, P = _Totals(cur), _Totals(prior)
    unit, buckets = buckets_for(date.fromisoformat(period["from"]), date.fromisoformat(period["to"]))
    bidx = _bucket_index(buckets)
    nb = len(buckets)
    base_link = {k: v for k, v in flt.items() if v} | {"from": period["from"], "to": period["to"]}
    blink = [{"from": b["from"], "to": b["to"]} for b in buckets]
    days = period["days"]

    by_bucket: list[list[dict]] = [[] for _ in buckets]
    for c in cur:
        i = bidx(c["created_at"][:10])
        if i is not None:
            by_bucket[i].append(c)
    decided_by_bucket: list[list[dict]] = [[] for _ in buckets]
    for c in scoped:
        if is_decided(c):
            i = bidx(c["decision"]["decided_at"][:10])
            if i is not None:
                decided_by_bucket[i].append(c)
    bt = [_Totals(rows) for rows in by_bucket]

    def kpi(key, label, value, fmt, series, prev, *, semantics="up-good", rate=False, link=None):
        delta = round(value - prev, 1) if rate else _change(value, prev)
        return {"key": key, "label": label, "value": value, "format": fmt, "series": series,
                "delta": None if delta is None else {"value": delta, "unit": "pp" if rate else "%"}, "delta_semantics": semantics,
                "link": link or {}}

    kpis = [
        kpi("claims", "Claims", T.count, "number", [t.count for t in bt], P.count),
        kpi("approved", "Approved", T.approved, "inr", [t.approved for t in bt], P.approved, link={"segment": "paid"}),
        kpi("avg_claim", "Avg claim", round(T.avg_claim), "inr", [round(t.avg_claim) for t in bt], P.avg_claim, semantics="up-bad"),
        kpi("fraud_rate", "Fraud rate", T.fraud_rate, "percent", [t.fraud_rate for t in bt], P.fraud_rate, semantics="up-bad", rate=True,
            link={"segment": "fraud_detected"}),
        kpi("stp_rate", "STP rate", T.stp, "percent", [t.stp for t in bt], P.stp, rate=True, link={"segment": "auto_decided"}),
        kpi("avg_tat", "Avg TAT", round(T.tat, 1), "hours", [round(t.tat, 1) for t in bt], P.tat, semantics="up-bad",
            link={"segment": "decided"}),
    ]

    charts: dict[str, dict] = {}

    # 1 Filed vs settled / approved
    settled = [sum(1 for c in rows if c["status"] in PAID_STATUSES) for rows in decided_by_bucket]
    charts["filed_settled"] = {
        "buckets": buckets, "filed": [t.count for t in bt], "settled": settled,
        "links": {"filed": blink, "settled": [b | {"date_on": "decided", "segment": "paid"} for b in blink]},
        "insight": f"{T.count:,} filed · {sum(settled):,} settled or approved in the period · "
                   + _trend(_change(T.count, P.count), "filings", days).lower(),
    }

    # 2 Status
    status = [{"key": k, "label": label, "value": sum(1 for c in cur if c["status"] in st), "link": {"segment": f"bucket_{k}"}}
              for k, label, st in BUCKETS]
    top = max(status, key=lambda s: s["value"])
    charts["status"] = {"items": status, "total": T.count,
                        "insight": f"{top['label']} is the largest group — {_pct(top['value'], T.count):.0f}% of claims" if T.count else ""}

    # 3 Vehicle type
    vt = Counter(c["vehicle"]["type"] for c in cur)
    items = [{"key": k, "label": VEHICLE_LABELS[k], "value": vt.get(k, 0), "link": {"vehicle_type": k}} for k in VEHICLE_LABELS]
    lead = max(items, key=lambda s: s["value"])
    charts["vehicle_type"] = {"items": items, "total": T.count,
                              "insight": f"{lead['label']}s make up {_pct(lead['value'], T.count):.0f}% of claims" if T.count else ""}

    # 4 Claim type
    ct = Counter(c["claim_type"] for c in cur)
    items = [{"key": k, "label": k, "value": ct.get(k, 0), "link": {"claim_type": k}} for k in CLAIM_TYPES]
    non_od = T.count - ct.get("OD", 0)
    charts["claim_type"] = {"items": items, "total": T.count,
                            "insight": f"Own damage {_pct(ct.get('OD', 0), T.count):.0f}% · theft and total loss {ct.get('Theft', 0) + ct.get('Total loss', 0)} claims"
                            if T.count else "", "non_od": non_od}

    # 5 Channel over time
    channels = list(CHANNEL_LABELS)
    series = [{"key": ch, "label": CHANNEL_LABELS[ch], "values": [sum(1 for c in rows if c["channel"] == ch) for rows in by_bucket],
               "links": [b | {"channel": ch} for b in blink]} for ch in channels]
    wa_now = _pct(sum(1 for c in cur if c["channel"] == "whatsapp"), T.count)
    wa_prev = _pct(sum(1 for c in prior if c["channel"] == "whatsapp"), P.count)
    charts["channel_trend"] = {"buckets": buckets, "series": series,
                               "insight": f"WhatsApp brings {wa_now:.0f}% of claims ({wa_now - wa_prev:+.1f} pp vs previous {days} days)"
                               if T.count and P.count else (f"WhatsApp brings {wa_now:.0f}% of claims" if T.count else "")}

    # 6 Money
    charts["amounts"] = {
        "buckets": buckets, "claimed": [round(t.claimed) for t in bt], "approved": [round(t.approved) for t in bt],
        "saved": [round(t.savings) for t in bt],
        "links": {"claimed": blink, "approved": [b | {"segment": "paid"} for b in blink],
                  "saved": [b | {"segment": "fraud_savings"} for b in blink]},
        "insight": f"{_inr(T.approved)} approved of {_inr(T.claimed)} claimed · {_inr(T.savings)} saved from fraud and overquotes",
    }

    # 7 Avg claim size by vehicle type & city tier
    tiers = [1, 2, 3]
    grid = []
    for k in VEHICLE_LABELS:
        row = []
        for tier in tiers:
            rows = [c for c in cur if c["vehicle"]["type"] == k and ctx.tier_of(c) == tier]
            row.append({"value": round(mean(c["amount_claimed"] for c in rows)) if rows else None, "count": len(rows),
                        "link": {"vehicle_type": k, "city_tier": str(tier)}})
        grid.append({"key": k, "label": VEHICLE_LABELS[k], "cells": row})
    avg_vt = {k: mean(c["amount_claimed"] for c in cur if c["vehicle"]["type"] == k) for k in VEHICLE_LABELS
              if any(c["vehicle"]["type"] == k for c in cur)}
    insight = ""
    if len(avg_vt) >= 2:
        hi_k, lo_k = max(avg_vt, key=avg_vt.get), min(avg_vt, key=avg_vt.get)
        insight = f"{VEHICLE_LABELS[hi_k]} claims average {_inr(avg_vt[hi_k])} — {avg_vt[hi_k] / avg_vt[lo_k]:.1f}× {VEHICLE_LABELS[lo_k].lower()} claims"
    charts["claim_size"] = {"tiers": [{"key": t, "label": f"Tier {t}"} for t in tiers], "rows": grid, "insight": insight}

    # 8 Fraud rate and savings
    charts["fraud_trend"] = {
        "buckets": buckets, "savings": [round(t.savings) for t in bt], "rate": [t.fraud_rate for t in bt], "counts": [t.fraud for t in bt],
        "links": {"savings": [b | {"segment": "fraud_savings"} for b in blink], "rate": [b | {"segment": "fraud_detected"} for b in blink]},
        "insight": _trend(_change(T.savings, P.savings), "fraud savings", days) + f" · fraud rate {T.fraud_rate:.1f}%",
    }

    # 9 Risk distribution
    scored = [c for c in cur if c.get("risk_score") is not None]
    bins = []
    for lo, hi in RISK_BINS:
        band = "low" if hi < 30 else "medium" if hi <= 70 else "high"
        bins.append({"label": f"{lo}–{hi}", "band": band, "value": sum(1 for c in scored if lo <= c["risk_score"] <= hi),
                     "link": {"min_risk": str(lo), "max_risk": str(hi)}})
    high = sum(1 for c in scored if c["risk_band"] == "high")
    charts["risk_distribution"] = {"bins": bins, "scored": len(scored),
                                   "insight": f"{_pct(sum(1 for c in scored if c['risk_band'] == 'low'), len(scored)):.0f}% low risk · "
                                              f"{high} high-risk claim{'s' if high != 1 else ''} ({_pct(high, len(scored)):.1f}%)" if scored else ""}

    # 10 Top fraud flags
    names = {r["id"]: r["name"] for r in rules}
    fired = Counter(rid for c in cur for rid in {f["rule_id"] for f in (c.get("fraud") or {}).get("fired", [])})  # once per claim
    flags = [{"key": rid, "label": names.get(rid, rid), "value": n, "link": {"rule": rid}} for rid, n in fired.most_common(8)]
    charts["fraud_flags"] = {"items": flags,
                             "insight": f"{flags[0]['key']} {flags[0]['label']} fired most — {flags[0]['value']} claims" if flags else ""}

    # 11 Funnel
    stages = [("FNOL", None, T.count), ("Verified", "verified", None), ("Assessed", "assessed", None), ("Approved", "paid", None),
              ("Settled", "settled", None)]
    funnel = []
    for label, seg, value in stages:
        n = value if value is not None else sum(1 for c in cur if cf.SEGMENTS[seg](c))
        funnel.append({"label": label, "value": n, "link": {"segment": seg} if seg else {}})
    drops = [(funnel[i]["label"], funnel[i + 1]["label"], 1 - funnel[i + 1]["value"] / funnel[i]["value"])
             for i in range(len(funnel) - 1) if funnel[i]["value"]]
    worst = max(drops, key=lambda d: d[2]) if drops else None
    charts["funnel"] = {"stages": funnel,
                        "insight": f"Largest drop: {worst[0]} → {worst[1]} (−{worst[2] * 100:.0f}%)" if worst and worst[2] > 0 else ""}

    # 12 Routing flow (Sankey): risk band → route → outcome
    nodes, links = [], []
    flows = Counter()
    for c in scored:
        flows[("band", c["risk_band"], "route", cf.route_of(c))] += 1
        flows[("route", cf.route_of(c), "outcome", cf.outcome_of(c))] += 1
    label_of = {"band": dict(BANDS), "route": cf.ROUTES, "outcome": {k: v[0] for k, v in cf.OUTCOMES.items()}}
    key_param = {"band": "risk_band", "route": "route", "outcome": "outcome"}
    used = set()
    for (sk, sv, tk, tv), n in sorted(flows.items(), key=lambda x: -x[1]):
        s, t = label_of[sk][sv], label_of[tk][tv]
        used |= {(sk, sv), (tk, tv)}
        links.append({"source": s, "target": t, "value": n, "link": {key_param[sk]: sv, key_param[tk]: tv}})
    for kind in ("band", "route", "outcome"):
        for k, label in label_of[kind].items():
            if (kind, k) in used:
                nodes.append({"name": label, "kind": kind, "link": {key_param[kind]: k}})
    high_rows = [c for c in scored if c["risk_band"] == "high"]
    siu = sum(1 for c in high_rows if cf.route_of(c) == "SIU")
    charts["routing"] = {"nodes": nodes, "links": links,
                         "insight": f"{_pct(siu, len(high_rows)):.0f}% of high-risk claims went to SIU · "
                                    f"{_pct(sum(1 for c in scored if cf.route_of(c) == 'auto'), len(scored)):.0f}% straight-through"
                         if high_rows else (f"{_pct(sum(1 for c in scored if cf.route_of(c) == 'auto'), len(scored)):.0f}% straight-through" if scored else "")}

    # 13 Turnaround by channel and risk band
    tat_series = []
    cells = []
    for band, blabel in BANDS:
        vals = []
        for ch in channels:
            rows = [c for c in T.decided if c["channel"] == ch and c.get("risk_band") == band]
            v = max(0.01, round(mean(_tat_h(c) for c in rows), 2)) if rows else None   # > 0: the chart uses a log axis
            vals.append({"value": v, "count": len(rows), "link": {"channel": ch, "risk_band": band, "segment": "decided"}})
            if v is not None:
                cells.append((v, CHANNEL_LABELS[ch], blabel))
        tat_series.append({"key": band, "label": blabel, "values": vals})
    charts["tat"] = {"channels": [{"key": ch, "label": CHANNEL_LABELS[ch]} for ch in channels], "series": tat_series,
                     "insight": (f"Fastest: {min(cells)[1]} {min(cells)[2].lower()} ({_hours(min(cells)[0])}) · slowest: "
                                 f"{max(cells)[1]} {max(cells)[2].lower()} ({_hours(max(cells)[0])})") if len(cells) >= 2 else ""}

    # 14 STP
    charts["stp"] = {"value": T.stp, "decided": len(T.decided), "auto": T.auto, "series": [t.stp for t in bt], "buckets": buckets,
                     "link": {"segment": "auto_decided"},
                     "insight": (f"{T.auto:,} of {len(T.decided):,} decisions straight-through · {T.stp - P.stp:+.1f} pp vs previous {days} days"
                                 if P.decided else f"{T.auto:,} of {len(T.decided):,} decisions straight-through")}

    # 15 Cities
    cc = Counter(c["city"] for c in cur)
    cities = [{"key": city, "label": city, "value": n, "tier": ctx.city_tier.get(city), "share": _pct(n, T.count), "link": {"city": city}}
              for city, n in cc.most_common(10)]
    charts["cities"] = {"items": cities, "city_count": len(cc),
                        "insight": f"Top 3 cities bring {_pct(sum(x['value'] for x in cities[:3]), T.count):.0f}% of claims · "
                                   f"{len(cc)} cities in total" if cities else ""}

    # 16 Garage leaderboard
    garages = defaultdict(list)
    for c in cur:
        if c.get("garage_name"):
            garages[c["garage_name"]].append(c)
    board = []
    for name, rows in garages.items():
        quoted = [c["financials"]["variance_pct"] for c in rows
                  if (c.get("financials") or {}).get("garage_quote") and c["financials"].get("variance_pct") is not None]
        decided = [c for c in rows if is_decided(c)]
        board.append({"key": name, "label": name, "city": ctx.garage_city.get(name, rows[0]["city"]), "type": ctx.garage_type_of(rows[0]), "volume": len(rows),
                      "avg_overquote_pct": round(mean(quoted), 1) if quoted else None,
                      "avg_tat_h": round(mean(_tat_h(c) for c in decided), 1) if decided else None, "link": {"garage": name}})
    board.sort(key=lambda g: (-g["volume"], g["label"]))
    board = board[:8]
    worst_g = max((g for g in board if g["avg_overquote_pct"] is not None), key=lambda g: g["avg_overquote_pct"], default=None)
    charts["garages"] = {"items": board,
                         "insight": (f"{board[0]['label']} handles the most claims ({board[0]['volume']}) · highest overquote: "
                                     f"{worst_g['label']} (+{worst_g['avg_overquote_pct']:.0f}%)") if board and worst_g else
                                    (f"{board[0]['label']} handles the most claims ({board[0]['volume']})" if board else "")}

    # 17 FNOL heatmap
    heat = Counter(cf.ist_hour_dow(c) for c in cur)
    cells = [[h, d, heat.get((d, h), 0)] for d in range(7) for h in range(24)]
    peak = max(heat.items(), key=lambda x: x[1]) if heat else None
    by_day = Counter(d for (d, _h), n in heat.items() for _ in range(n))
    charts["heatmap"] = {"days": DAYS, "cells": cells, "max": max(heat.values(), default=0),
                         "insight": (f"Busiest hour: {DAYS[peak[0][0]]} {peak[0][1]:02d}:00–{(peak[0][1] + 1) % 24:02d}:00 · "
                                     f"busiest day: {DAYS[by_day.most_common(1)[0][0]]}") if peak else ""}

    # 18 Agent performance
    perf = agent_performance(cur, runs)
    timed = [a for a in perf["agents"] if a["avg_latency_s"] is not None]
    slowest = max(timed, key=lambda a: a["avg_latency_s"], default=None)
    worst_ok = min((a for a in timed if a["success_rate"] is not None), key=lambda a: a["success_rate"], default=None)
    if slowest and worst_ok:
        ok = ("every agent completed without a fallback" if worst_ok["success_rate"] == 100
              else f"lowest success: {worst_ok['label']} {worst_ok['success_rate']:.1f}%")
        perf["insight"] = f"Slowest step: {slowest['label']} (avg {slowest['avg_latency_s']:.1f} s) · {ok}"
    else:
        perf["insight"] = ""
    charts["agents"] = perf

    # 19 Human override rate (by decision date)
    human = [[c for c in rows if cf.is_human_decision(c)] for rows in decided_by_bucket]
    over = [[c for c in rows if cf.is_overridden(c)] for rows in human]
    tot_h, tot_o = sum(map(len, human)), sum(map(len, over))
    prior_h = [c for c in scoped if cf.is_human_decision(c) and period["prior_from"] <= c["decision"]["decided_at"][:10] <= period["prior_to"]]
    prior_o = sum(1 for c in prior_h if cf.is_overridden(c))
    charts["overrides"] = {
        "buckets": buckets, "rate": [_pct(len(o), len(h)) if h else None for h, o in zip(human, over)],
        "decisions": [len(h) for h in human], "overrides": [len(o) for o in over],
        "links": [b | {"date_on": "decided", "segment": "overridden"} for b in blink],
        "insight": (f"Handlers overrode the AI in {_pct(tot_o, tot_h):.0f}% of {tot_h} decisions"
                    + (f" ({_pct(tot_o, tot_h) - _pct(prior_o, len(prior_h)):+.1f} pp vs previous {days} days)" if prior_h else ""))
                   if tot_h else "",
    }

    # 20 This FY vs last FY (same period) — uses the filter bar but not the date range, by definition
    fy = fy_start(now).date()
    today = now.date()
    last_fy_same_end = date(fy.year - 1, today.month, today.day) if not (today.month == 2 and today.day == 29) else date(fy.year - 1, 2, 28)
    periods = [("last_fy", "Last FY (same period)", date(fy.year - 1, 4, 1), last_fy_same_end),
               ("this_fy", "This FY to date", fy, today)]
    yoy = []
    for key, label, lo, hi in periods:
        t = _Totals(cf.apply(scoped, {"from": lo.isoformat(), "to": hi.isoformat()}, ctx))
        link = {"from": lo.isoformat(), "to": hi.isoformat()}
        yoy.append({"key": key, "label": label, "from": lo.isoformat(), "to": hi.isoformat(),
                    "metrics": {"claims": {"value": t.count, "link": link}, "approved": {"value": round(t.approved), "link": link | {"segment": "paid"}},
                                "fraud": {"value": t.fraud, "link": link | {"segment": "fraud_detected"}}}})
    ch = _change(yoy[1]["metrics"]["claims"]["value"], yoy[0]["metrics"]["claims"]["value"])
    ca = _change(yoy[1]["metrics"]["approved"]["value"], yoy[0]["metrics"]["approved"]["value"])
    charts["yoy"] = {"periods": yoy, "metrics": [{"key": "claims", "label": "Claims", "format": "number"},
                                                 {"key": "approved", "label": "Approved ₹", "format": "inr"},
                                                 {"key": "fraud", "label": "Fraud detected", "format": "number"}],
                     "insight": (f"Claims {ch:+.0f}% and approved ₹ {ca:+.0f}% vs the same point last FY" if ch is not None and ca is not None
                                 else "No claims in the same period last FY to compare")}

    options_src = claims
    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "period": period | {"bucket": unit},
        "filters": flt,
        "base_link": base_link,
        "total": T.count,
        "totals": {"claims": T.count, "paid": len(T.paid), "approved": T.approved, "fraud_detected": T.fraud, "fraud_savings": T.savings,
                   "avg_tat_h": T.tat, "stp_rate": T.stp, "decided": len(T.decided)},
        "options": {
            "vehicle_type": [{"value": k, "label": v} for k, v in VEHICLE_LABELS.items()],
            "claim_type": [{"value": k, "label": k} for k in CLAIM_TYPES],
            "city": [{"value": c, "label": c} for c in sorted({c["city"] for c in options_src})],
            "channel": [{"value": k, "label": v} for k, v in CHANNEL_LABELS.items()],
            "garage_type": [{"value": k, "label": v} for k, v in GARAGE_TYPE_LABELS.items()],
        },
        "kpis": kpis,
        "charts": charts,
    }
