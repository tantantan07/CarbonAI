"""
CarbonAI — multi-scenario planner.

Users create several scenarios. Each scenario takes:
  name, scope ("all" | 1 | 2 | 3), resolution ("annual" | "quarterly" | "monthly"),
  horizon_years, ramp_years, growth_rate (%), switches {tech_id: adoption 0..1}

The scope limits which climate-tech switches are allowed; the resolution
sets the time-step of the projection returned to the charts.
"""

from __future__ import annotations

from climate_tech import CATALOGUE_BY_ID, apply_switches
from emission_engine import DEFAULT_FACTORS, Factor
from ml_engine import SBTI_ANNUAL_REDUCTION, forecast

STEPS = {"annual": 1, "yearly": 1, "quarterly": 4, "monthly": 12}


def run_scenario(activity: dict, scenario: dict, default_growth: float,
                 factors: dict[str, Factor] | None = None) -> dict:
    factors = factors or DEFAULT_FACTORS
    scope = str(scenario.get("scope", "all")).lower().replace("scope", "").strip() or "all"
    resolution = str(scenario.get("resolution", "annual")).lower()
    steps = STEPS.get(resolution, 1)
    horizon = int(min(max(int(scenario.get("horizon_years") or 5), 1), 10))
    ramp = float(scenario.get("ramp_years") or 3)
    growth = (float(scenario["growth_rate"]) / 100) if scenario.get("growth_rate") not in (None, "") else default_growth

    raw = scenario.get("switches") or {}
    switches, skipped = {}, []
    for tid, adoption in raw.items():
        tech = CATALOGUE_BY_ID.get(tid)
        if not tech:
            continue
        a = float(adoption or 0)
        if a > 1:
            a = a / 100  # accept percentages
        if scope != "all" and str(tech["scope"]) != scope:
            skipped.append(tid)
            continue
        if a > 0:
            switches[tid] = min(a, 1.0)

    baseline = forecast(activity, factors, growth, years=horizon, steps_per_year=steps)
    projected = forecast(activity, factors, growth, years=horizon, switches=switches, ramp_years=ramp, steps_per_year=steps)

    series = [
        {"period": b["period"], "baseline": b["total"], "scenario": p["total"],
         "scope1": p["scope1"], "scope2": p["scope2"], "scope3": p["scope3"]}
        for b, p in zip(baseline, projected)
    ]
    cumulative = round(sum(b["total"] - p["total"] for b, p in zip(baseline, projected)) / steps, 2)
    end_base, end_scn = baseline[-1]["total"], projected[-1]["total"]
    start = baseline[0]["total"]
    reduction_vs_bau = round((1 - end_scn / end_base) * 100, 1) if end_base else 0
    change_vs_today = round((end_scn / start - 1) * 100, 1) if start else 0
    target_end = start * (1 - SBTI_ANNUAL_REDUCTION) ** horizon

    full = apply_switches(activity, switches, factors)
    capex = full["total_capex_inr"]
    saving = full["total_annual_saving_inr"]
    payback = round(capex / saving, 1) if saving > 0 and capex > 0 else None

    return {
        "name": scenario.get("name") or "Untitled scenario",
        "scope": scope,
        "resolution": resolution,
        "horizon_years": horizon,
        "growth_rate": growth,
        "switches_applied": switches,
        "switches_skipped_out_of_scope": skipped,
        "series": series,
        "end_baseline": end_base,
        "end_scenario": end_scn,
        "reduction_vs_bau_pct": reduction_vs_bau,
        "change_vs_today_pct": change_vs_today,
        "cumulative_abatement_tco2e": cumulative,
        "capex_inr": capex,
        "annual_saving_inr": saving,
        "payback_years": payback,
        "meets_1p5_target": end_scn <= target_end,
        "target_end": round(target_end, 2),
        "tech_detail": full["switches"],
        "justification": (
            f"Projection at {resolution} resolution over {horizon} yrs: activity grows {growth*100:.0f}%/yr, "
            f"switches ramp linearly to target adoption over {ramp:g} yrs, grid factor falls 2%/yr. "
            f"1.5°C check: end-year emissions {end_scn:,.1f} t vs pathway limit {target_end:,.1f} t."
        ),
    }


def compare(activity: dict, scenarios: list[dict], default_growth: float,
            factors: dict[str, Factor] | None = None) -> dict:
    runs = [run_scenario(activity, s, default_growth, factors) for s in scenarios[:6]]
    if not runs:
        return {"scenarios": [], "recommended": None}

    max_abate = max(r["cumulative_abatement_tco2e"] for r in runs) or 1
    for r in runs:
        effectiveness = r["cumulative_abatement_tco2e"] / max_abate
        cost_eff = 1.0
        if r["capex_inr"] > 0 and r["cumulative_abatement_tco2e"] > 0:
            per_t = r["capex_inr"] / r["cumulative_abatement_tco2e"]
            cost_eff = 1 / (1 + per_t / 20000)  # ₹20k per tonne reference
        r["score"] = round(100 * (0.55 * effectiveness + 0.30 * cost_eff + 0.15 * (1 if r["meets_1p5_target"] else 0)))

    best = max(runs, key=lambda r: r["score"])
    return {
        "scenarios": runs,
        "recommended": best["name"],
        "justification": (
            "Score = 55% cumulative abatement (relative to best) + 30% capital efficiency "
            "(₹ capex per tonne avoided, ₹20k/t reference) + 15% for meeting the 1.5°C pathway. "
            f"'{best['name']}' scores highest ({best['score']}/100)."
        ),
    }
