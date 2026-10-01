"""Explainable, deterministic fraud rules."""
RULES = [
 ("FR-01",35,lambda c: c.get("location_contradiction",False)),("FR-02",30,lambda c: c.get("pre_existing_confidence",0)>=.70),
 ("FR-03",20,lambda c: c.get("narrative_consistent") is False and c.get("narrative_confidence",0)>=.65),("FR-04",15,lambda c:c.get("od_claims_12m",0)>=2),
 ("FR-05",15,lambda c:c.get("early_claim",False)),("FR-06",lambda c:15 if c.get("garage_variance",0)>30 else (5 if c.get("garage_variance",0)>15 else 0),lambda c:c.get("garage_variance",0)>15),
 ("FR-07",25,lambda c:c.get("network_link",False)),("FR-08",40,lambda c:c.get("blacklisted_or_stolen",False)),("FR-09",15,lambda c:c.get("owner_mismatch",False)),
 ("FR-10",20,lambda c:c.get("invalid_dl",False)),("FR-11",15,lambda c:c.get("photo_metadata_mismatch",False)),("FR-12",10,lambda c:c.get("late_intimation",False)),
 ("FR-13",15,lambda c:c.get("commercial_use",False)),("FR-14",5,lambda c:c.get("unwitnessed_night",False)),("FR-15",25,lambda c:c.get("tampering",False))]
def evaluate_fraud(context):
    fired=[]; not_fired=[]; score=0; hard=False
    for rid, pts, cond in RULES:
        hit=bool(cond(context)); (fired if hit else not_fired).append(rid)
        if hit:
            p=pts(context) if callable(pts) else pts; score += p; hard |= rid=="FR-08"
    score=min(100,score); level="high" if hard or score>=71 else ("medium" if score>=30 else "low")
    return {"score":score,"level":level,"routing":"SIU" if hard or score>=71 else ("handler" if score>=30 else "auto"),"hard_stop":hard,"fired_rule_ids":fired,"not_fired_rule_ids":not_fired}
