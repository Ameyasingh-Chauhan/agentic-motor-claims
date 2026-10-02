"""§12 costing: calibration example, depreciation, deductibles, total loss, display rounding."""
from dataclasses import replace

import pytest

from app.services import costing, reference


@pytest.fixture(scope="module")
def ref():
    return reference.reload()


def test_pinned_creta_prices(ref):
    expected = {"HYU-CRE-FBMP": 12500, "HYU-CRE-RBMP": 11200, "HYU-CRE-HLED": 17400, "HYU-CRE-BMRF": 3770,
                "HYU-CRE-TLGT": 17500, "HYU-CRE-TLMP": 7200}
    assert {k: ref.parts[k]["replace"] for k in expected} == expected


def test_worked_example_lines(ref):
    result = costing.worked_example(ref)
    lines = {line["part_code"]: line["line_total"] for line in result["lines"]}
    assert lines == {"HYU-CRE-FBMP": 11575, "HYU-CRE-HLED": 9250, "HYU-CRE-BMRF": pytest.approx(3204.5)}
    assert result["extras"] == [{"description": "Wheel alignment & balancing", "amount": 1100}]
    assert result["assessed_loss"] == pytest.approx(25129.5)
    assert result["compulsory_deductible"] == 1000
    assert result["net_payable"] == pytest.approx(24129.5)
    assert result["display_net_payable"] == 24130


def test_worked_example_runs_the_real_calculation(ref, monkeypatch):
    """Fails if worked_example() ever returns a hard-coded answer instead of calling calculate_cost."""
    calls = []
    real = costing.calculate_cost

    def spy(*args, **kwargs):
        calls.append(args)
        return real(*args, **kwargs)

    monkeypatch.setattr(costing, "calculate_cost", spy)
    costing.worked_example(ref)
    assert len(calls) == 1

    # A different rate card must change the answer: +₹1,000 on the bumper → +₹500 after 50% plastic depreciation.
    parts = dict(ref.parts)
    parts["HYU-CRE-FBMP"] = {**parts["HYU-CRE-FBMP"], "replace": 13500}
    assert real(costing.WORKED_EXAMPLE_ITEMS, costing.WORKED_EXAMPLE_CONTEXT, front_impact=True,
                ref=replace(ref, parts=parts))["net_payable"] == pytest.approx(24629.5)
    assert costing.worked_example(replace(ref, parts=parts))["net_payable"] == pytest.approx(24629.5)


@pytest.mark.parametrize("months,pct", [(6, 0), (7, .05), (12, .05), (13, .10), (25, .15), (40, .25), (55, .35), (100, .40), (130, .50)])
def test_metal_depreciation_slabs(ref, months, pct):
    assert costing.depreciation_pct("metal", months, ref=ref) == pct


def test_material_depreciation_and_zero_dep(ref):
    assert costing.depreciation_pct("plastic", 1, ref=ref) == .5
    assert costing.depreciation_pct("fibreglass", 1, ref=ref) == .3
    assert costing.depreciation_pct("glass", 90, ref=ref) == 0
    assert costing.depreciation_pct("plastic", 90, zero_dep=True, ref=ref) == 0


def test_deductibles(ref):
    assert costing.compulsory_deductible("Car", 1497, ref) == 1000
    assert costing.compulsory_deductible("Car", 1600, ref) == 2000
    assert costing.compulsory_deductible("2W", 110, ref) == 100
    assert costing.compulsory_deductible("CV", 700, ref) == 500


def test_two_wheeler_labour_is_45_percent(ref):
    ctx = costing.VehicleContext(segment="TW_COMMUTER", vehicle_type="2W", cc=110, age_months=12)
    assert costing.labour_rate(ctx, ref) == pytest.approx(1100 * .45)


def test_total_loss_routes_to_idv_minus_salvage(ref):
    ctx = costing.VehicleContext(segment="CAR_PREMIUM_HATCH", cc=1197, age_months=110, idv=60_000, salvage_pct=.2)
    items = [{"part_code": f"MAR-SWI-{c}", "operation": "replace"} for c in ("FBMP", "RBMP", "BONT", "FDOR", "RDOR", "RADI", "AIRB")]
    result = costing.calculate_cost(items, ctx, ref=ref)
    assert result["total_loss_check"]["is_total_loss"] is True
    assert result["net_payable"] == pytest.approx(60_000 - 12_000 - 1000)


def test_garage_variance_levels(ref):
    ctx = costing.WORKED_EXAMPLE_CONTEXT
    base = costing.worked_example(ref)["assessed_loss"]
    level = lambda q: costing.calculate_cost(costing.WORKED_EXAMPLE_ITEMS, ctx, front_impact=True, garage_quote=q, ref=ref)["variance_level"]
    assert level(base * 1.10) == "pass" and level(base * 1.20) == "warn" and level(base * 1.40) == "fail"


def test_display_rounding_is_half_up():
    assert costing.display_rupees(24125) == 24130
    assert costing.display_rupees(24124.9) == 24120


def test_llm_discrepancy_is_logged_python_wins(ref):
    result = costing.calculate_cost(costing.WORKED_EXAMPLE_ITEMS, costing.WORKED_EXAMPLE_CONTEXT, front_impact=True, llm_total=26000, ref=ref)
    assert result["net_payable"] == pytest.approx(24129.5)
    assert result["llm_arithmetic_discrepancy"]["resolution"] == "Python calculation used"
