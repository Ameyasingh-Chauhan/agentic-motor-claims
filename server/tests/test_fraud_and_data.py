"""§13 DMN rules and §11.3/§14.3 seeded data."""
from collections import Counter

import pytest

from app.schemas.claim import STATUSES, Claim
from app.services import reference
from app.services.dmn_engine import evaluate_fraud
from app.services.json_store import read_json_sync

RULE_CONTEXTS = {
    "FR-01": {"location_contradiction": True}, "FR-02": {"pre_existing_confidence": .8},
    "FR-03": {"narrative_consistent": False, "narrative_confidence": .8}, "FR-04": {"od_claims_12m": 2},
    "FR-05": {"early_claim": True}, "FR-06": {"garage_variance_pct": 20}, "FR-07": {"network_link": True},
    "FR-08": {"blacklisted_or_stolen": True}, "FR-09": {"owner_mismatch": True}, "FR-10": {"invalid_dl": True},
    "FR-11": {"photo_metadata_mismatch": True}, "FR-12": {"late_intimation": True}, "FR-13": {"commercial_use": True},
    "FR-14": {"unwitnessed_night": True}, "FR-15": {"tampering_confidence": .8},
}


@pytest.fixture(scope="module")
def claims():
    reference.reload()
    return [c for c in read_json_sync("claims.json", []) if c.get("origin") != "app"]  # seeded claims only


@pytest.mark.parametrize("rule_id", sorted(RULE_CONTEXTS))
def test_each_rule_fires_alone(rule_id):
    result = evaluate_fraud(RULE_CONTEXTS[rule_id], reference.load().fraud_rules)
    assert result["fired_rule_ids"] == [rule_id]


def test_bands_hard_stop_and_fr06_tiers():
    rules = reference.load().fraud_rules
    assert evaluate_fraud({}, rules)["band"] == "low"
    hard = evaluate_fraud({"blacklisted_or_stolen": True}, rules)
    assert hard["score"] == 40 and hard["band"] == "high" and hard["routing"] == "SIU" and hard["hard_stop"]
    assert evaluate_fraud({"garage_variance_pct": 20}, rules)["score"] == 5
    assert evaluate_fraud({"garage_variance_pct": 34}, rules)["score"] == 15
    assert evaluate_fraud({"location_contradiction": True, "pre_existing_confidence": .9}, rules)["band"] == "medium"


def test_every_claim_validates_and_uses_spec_statuses(claims):
    assert 240 <= len(claims) <= 260
    for c in claims:
        Claim.model_validate(c)
        assert c["status"] in STATUSES


def test_scores_and_amounts_come_from_the_engines(claims):
    rules = reference.load().fraud_rules
    for c in claims:
        assert c["risk_score"] == c["fraud"]["score"] == sum(f["points"] for f in c["fraud"]["fired"]) or c["risk_score"] == 100
        assert c["financials"]["net_payable"] >= 0
    assert len({c["amount_claimed"] for c in claims}) > 0.9 * len(claims)
    assert {r["id"] for r in rules} == set(RULE_CONTEXTS)


def test_seed_distribution_is_realistic(claims):
    status = Counter(c["status"] for c in claims)
    assert 0.45 <= status["SETTLED"] / len(claims) <= 0.65  # open statuses only on recent claims → more settled history (decision 29)
    band = Counter(c["risk_band"] for c in claims)
    assert band["low"] > band["medium"] > band["high"] > 0
    assert sum(1 for c in claims if c["decision"]["auto"]) > 50
    months = Counter(c["created_at"][:7] for c in claims)
    assert len(months) >= 24
    assert len({c["registration"][:2] for c in claims}) >= 10
    assert len({c["customer_name"] for c in claims}) > 200


EXPECTED = {
    "clean_rear_end": ("PREAUTH_ISSUED", "auto", "low"),
    "fastag_mismatch": ("SIU_INVESTIGATION", "SIU", "high"),
    "garage_overquote": ("UNDER_REVIEW", "handler", "medium"),
    "theft_two_wheeler": ("INFO_REQUESTED", "handler", "low"),
    "flood_total_loss": ("UNDER_REVIEW", "handler", "low"),
}


def test_demo_scenarios_keep_their_outcomes(claims):
    by_id = {c["scenario_id"]: c for c in claims if c.get("scenario_id")}
    assert set(by_id) == set(EXPECTED)
    for sid, (status, route, band) in EXPECTED.items():
        c = by_id[sid]
        assert (c["status"], c["decision"]["route"], c["risk_band"]) == (status, route, band), sid
    assert by_id["clean_rear_end"]["registration"] == "MH 12 AB 1234" and by_id["clean_rear_end"]["decision"]["auto"]
    assert by_id["fastag_mismatch"]["fraud"]["fired"][0]["rule_id"] == "FR-01"
    assert by_id["fastag_mismatch"]["checks"]["fastag"]["level"] == "fail"
    assert by_id["garage_overquote"]["financials"]["variance_pct"] == pytest.approx(34, abs=0.5)
    assert by_id["garage_overquote"]["decision"]["recommended_action"] == "approve_revised"
    assert by_id["theft_two_wheeler"]["incident"]["fir"] is not None
    assert by_id["flood_total_loss"]["financials"]["total_loss_check"]["is_total_loss"]
    assert by_id["flood_total_loss"]["financials"]["salvage"] > 0


def test_rahul_has_history_plus_scenario(claims):
    mine = [c for c in claims if c["customer_id"] == "c_0001"]
    assert len(mine) == 3
    assert Counter(c["status"] for c in mine) == Counter({"SETTLED": 1, "INFO_REQUESTED": 1, "PREAUTH_ISSUED": 1})
