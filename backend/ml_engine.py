"""
CarbonAI — analytics / prediction engine (v2).

Turns raw activity data into an *explained* analysis:

  • benchmark      : intensity vs industry peers (log-normal percentile)
  • uncertainty    : Monte Carlo over emission-factor uncertainty (P10/P50/P90)
  • drivers        : ranked hotspots + sensitivity (what a 10% cut is worth)
  • anomalies      : data-quality and plausibility checks
  • forecast       : 5-year business-as-usual projection with grid decarbonisation
  • target gap     : vs a 1.5°C-aligned 4.2%/yr absolute reduction pathway
  • readiness      : 0-100 decarbonisation readiness score
  • equivalents    : trees / car-km / homes, for non-experts
  • impacts        : plain "so what" statements per module

Every block carries a `justification` describing method, formula and
assumptions, so the UI can always answer "why?".

Benchmark values are indicative reference points for demo purposes and are
meant to be replaced with a sector dataset (e.g. BRSR disclosures).
"""

from __future__ import annotations

import math
import random

from climate_tech import DEFAULT_PRICES, apply_switches
from emission_engine import CATEGORIES, DEFAULT_FACTORS, Factor, calculate

# median tCO2e / employee / yr, log-sd, default growth, typical category share profile
INDUSTRY_PROFILES: dict[str, dict] = {
    "technology":    {"median": 2.5, "sigma": 0.6, "growth": 0.10,
                      "shares": {"electricity": 55, "commuting": 18, "air_travel": 15, "hotels": 5, "waste": 3, "diesel": 4}},
    "manufacturing": {"median": 25.0, "sigma": 0.8, "growth": 0.06,
                      "shares": {"electricity": 45, "natural_gas": 25, "diesel": 15, "waste": 6, "commuting": 5, "air_travel": 4}},
    "retail":        {"median": 6.0, "sigma": 0.6, "growth": 0.08,
                      "shares": {"electricity": 60, "diesel": 15, "waste": 10, "commuting": 10, "air_travel": 5}},
    "logistics":     {"median": 30.0, "sigma": 0.7, "growth": 0.08,
                      "shares": {"diesel": 65, "petrol": 10, "electricity": 15, "commuting": 5, "waste": 5}},
    "healthcare":    {"median": 8.0, "sigma": 0.6, "growth": 0.07,
                      "shares": {"electricity": 55, "natural_gas": 15, "waste": 15, "diesel": 8, "commuting": 7}},
    "education":     {"median": 3.0, "sigma": 0.6, "growth": 0.05,
                      "shares": {"electricity": 60, "commuting": 25, "waste": 8, "diesel": 7}},
    "hospitality":   {"median": 10.0, "sigma": 0.6, "growth": 0.08,
                      "shares": {"electricity": 50, "natural_gas": 25, "waste": 15, "diesel": 10}},
    "construction":  {"median": 20.0, "sigma": 0.8, "growth": 0.09,
                      "shares": {"diesel": 55, "electricity": 25, "waste": 12, "commuting": 8}},
    "finance":       {"median": 2.0, "sigma": 0.5, "growth": 0.07,
                      "shares": {"electricity": 50, "air_travel": 25, "commuting": 15, "hotels": 7, "waste": 3}},
    "agriculture":   {"median": 15.0, "sigma": 0.8, "growth": 0.04,
                      "shares": {"diesel": 50, "electricity": 30, "waste": 15, "petrol": 5}},
    "general":       {"median": 8.0, "sigma": 0.8, "growth": 0.07,
                      "shares": {"electricity": 50, "diesel": 15, "commuting": 12, "air_travel": 10, "waste": 8, "natural_gas": 5}},
}

INDUSTRY_ALIASES = {
    "it": "technology", "software": "technology", "tech": "technology", "saas": "technology",
    "factory": "manufacturing", "automotive": "manufacturing", "textile": "manufacturing", "pharma": "manufacturing",
    "transport": "logistics", "shipping": "logistics", "ecommerce": "retail", "e-commerce": "retail",
    "hospital": "healthcare", "school": "education", "university": "education", "hotel": "hospitality",
    "restaurant": "hospitality", "food": "hospitality", "real estate": "construction", "bank": "finance",
    "fintech": "finance", "insurance": "finance", "farming": "agriculture",
}

UNIT_COST_INR = {
    "electricity": DEFAULT_PRICES["grid_tariff_inr_kwh"],
    "natural_gas": DEFAULT_PRICES["gas_inr_m3"],
    "petrol": DEFAULT_PRICES["petrol_inr_l"],
    "diesel": DEFAULT_PRICES["diesel_inr_l"],
    "air_travel": DEFAULT_PRICES["air_inr_km"],
    "hotels": 5000.0,
    "commuting": 0.0,
    "waste": DEFAULT_PRICES["landfill_inr_kg"],
}

GRID_DECARB_PER_YEAR = 0.02     # CEA weighted avg fell ~0.79 → 0.727 t/MWh (FY20 → FY24)
AUTONOMOUS_EFFICIENCY = 0.01
SBTI_ANNUAL_REDUCTION = 0.042   # 1.5°C-aligned absolute contraction (SBTi cross-sector)


def normalise_industry(industry: str | None) -> str:
    key = (industry or "general").strip().lower()
    if key in INDUSTRY_PROFILES:
        return key
    for alias, target in INDUSTRY_ALIASES.items():
        if alias in key:
            return target
    for name in INDUSTRY_PROFILES:
        if name in key:
            return name
    return "general"


def _norm_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def equivalents(tco2e: float) -> dict:
    return {
        "trees_one_year": round(tco2e * 1000 / 22),               # ~22 kg CO2 absorbed per mature tree / yr
        "car_km": round(tco2e / 0.00017),                          # ~170 g/km mid-size petrol car
        "indian_homes_power_year": round(tco2e / (1200 * 0.000727), 1),  # 1,200 kWh/yr household
        "delhi_mumbai_flights": round(tco2e / (1150 * 0.00015), 1),       # one-way economy seat
    }


def monte_carlo(activity: dict, factors: dict[str, Factor], runs: int = 2000, seed: int = 42) -> dict:
    rng = random.Random(seed)
    totals = []
    for _ in range(runs):
        t = 0.0
        for c in CATEGORIES:
            f = factors[c]
            sampled = max(rng.gauss(f.value, f.value * f.uncertainty), 0)
            t += activity[c] * sampled
        totals.append(t)
    totals.sort()
    pick = lambda q: totals[min(int(q * runs), runs - 1)]
    return {
        "p10": round(pick(0.10), 2),
        "p50": round(pick(0.50), 2),
        "p90": round(pick(0.90), 2),
        "runs": runs,
        "justification": (
            f"{runs} Monte Carlo draws; each emission factor sampled from a normal distribution "
            "with its documented uncertainty (e.g. electricity ±5%, flights ±20%, waste ±40%). "
            "The P10–P90 band is the range we are 80% confident the true footprint lies in."
        ),
    }


def detect_anomalies(activity: dict, shares: dict, employees: int | None, profile: dict, total: float) -> list[dict]:
    flags = []
    emp = employees or 0
    typical = profile["shares"]

    for cat, typical_share in typical.items():
        if typical_share >= 15 and activity.get(cat, 0) == 0:
            flags.append({
                "severity": "warning", "category": cat,
                "message": f"No {DEFAULT_FACTORS[cat].label.lower()} reported, but it is usually ~{typical_share}% of the footprint in this industry. Is data missing?",
            })

    if emp > 0:
        checks = [
            ("electricity", 60000, "kWh per employee per year looks very high for most sectors"),
            ("commuting", 15000, "commute km per employee per year is above a 60 km/day round trip"),
            ("air_travel", 60000, "flight km per employee per year is unusually high"),
        ]
        for cat, limit, text in checks:
            per = activity.get(cat, 0) / emp
            if per > limit:
                flags.append({"severity": "warning", "category": cat, "message": f"{per:,.0f} {text}. Please double-check units."})
        if activity.get("commuting", 0) == 0:
            flags.append({"severity": "info", "category": "commuting",
                          "message": f"Commuting is empty — with {emp} employees, a quick survey usually adds 5–20% to Scope 3."})

    for cat, share in shares.items():
        expected = typical.get(cat, 3)
        if total > 0 and share - expected >= 25:
            flags.append({"severity": "hotspot", "category": cat,
                          "message": f"{DEFAULT_FACTORS[cat].label} is {share:.0f}% of your footprint vs ~{expected}% typical for peers — a priority hotspot."})
    return flags


def forecast(activity: dict, factors: dict[str, Factor], growth: float, years: int = 5,
             switches: dict | None = None, ramp_years: int = 3, start_year: int = 2026,
             total_sd: float = 0.0, steps_per_year: int = 1) -> list[dict]:
    """Projects emissions; switches ramp linearly to full adoption over ramp_years."""
    rows = []
    n = years * steps_per_year
    for i in range(n + 1):
        t = i / steps_per_year
        grown = {c: activity[c] * (1 + growth) ** t * (1 - AUTONOMOUS_EFFICIENCY) ** t for c in CATEGORIES}
        if switches:
            ramp = min(t / max(ramp_years, 0.25), 1.0)
            grown = apply_switches(grown, {k: v * ramp for k, v in switches.items()}, factors)["activity_after"]
        scope = {1: 0.0, 2: 0.0, 3: 0.0}
        for c in CATEGORIES:
            f = factors[c].value * ((1 - GRID_DECARB_PER_YEAR) ** t if factors[c].scope == 2 else 1)
            scope[factors[c].scope] += grown[c] * f
        tot = sum(scope.values())
        spread = math.sqrt(total_sd ** 2 * (1 + growth) ** (2 * t) + (0.03 * tot) ** 2 * t)
        year, sub = start_year + i // steps_per_year, i % steps_per_year
        label = str(year) if steps_per_year == 1 else (f"{year}-Q{sub + 1}" if steps_per_year == 4 else f"{year}-{sub + 1:02d}")
        rows.append({
            "period": label, "t": round(t, 3),
            "scope1": round(scope[1], 2), "scope2": round(scope[2], 2), "scope3": round(scope[3], 2),
            "total": round(tot, 2), "low": round(max(tot - 1.28 * spread, 0), 2), "high": round(tot + 1.28 * spread, 2),
        })
    return rows


def analyze(inputs: dict, profile: dict | None = None, factors: dict[str, Factor] | None = None) -> dict:
    profile = profile or {}
    factors = factors or DEFAULT_FACTORS
    period = profile.get("period", "annual")
    base = calculate(inputs, factors, period)
    activity = base["activity"]
    total = base["total_tco2e"]
    employees = int(profile.get("employees") or profile.get("employee_count") or 0) or None
    revenue_cr = float(profile.get("revenue_cr") or 0) or None

    industry = normalise_industry(profile.get("industry"))
    ind = INDUSTRY_PROFILES[industry]
    growth = float(profile.get("growth_rate")) / 100 if profile.get("growth_rate") not in (None, "") else ind["growth"]

    # ---- benchmark -------------------------------------------------------
    benchmark = None
    if employees and total > 0:
        per_emp = total / employees
        z = math.log(per_emp / ind["median"]) / ind["sigma"]
        pct = _norm_cdf(z) * 100
        benchmark = {
            "industry": industry,
            "per_employee": round(per_emp, 2),
            "peer_median": ind["median"],
            "percentile": round(pct),
            "verdict": "better than most peers" if pct < 40 else ("around the peer median" if pct < 60 else "more carbon-intensive than most peers"),
            "justification": (
                f"Intensity = {total:,.1f} tCO2e ÷ {employees} employees = {per_emp:.2f} t/employee. "
                f"Peers modelled as log-normal (median {ind['median']} t, σ={ind['sigma']}); "
                f"z = ln({per_emp:.2f}/{ind['median']})/{ind['sigma']} = {z:.2f} → {pct:.0f}th percentile "
                "(lower is better). Reference medians are indicative."
            ),
        }

    # ---- uncertainty -----------------------------------------------------
    mc = monte_carlo(activity, factors)
    total_sd = (mc["p90"] - mc["p10"]) / 2.56

    # ---- drivers & sensitivity ------------------------------------------
    drivers = []
    for cat in sorted(CATEGORIES, key=lambda c: -base["category_totals"][c]):
        t = base["category_totals"][cat]
        if t <= 0:
            continue
        drivers.append({
            "category": cat,
            "label": factors[cat].label,
            "scope": factors[cat].scope,
            "tco2e": t,
            "share": base["shares"][cat],
            "cut10_tco2e": round(t * 0.10, 3),
            "cut10_saving_inr": round(activity[cat] * 0.10 * UNIT_COST_INR[cat]),
            "justification": f"{activity[cat]:,.0f} {factors[cat].unit} × {factors[cat].value} tCO2e/{factors[cat].unit} ({factors[cat].source}).",
        })

    anomalies = detect_anomalies(activity, base["shares"], employees, ind, total)

    # ---- forecast & target gap ------------------------------------------
    bau = forecast(activity, factors, growth, years=5, total_sd=total_sd)
    target_2030 = round(total * (1 - SBTI_ANNUAL_REDUCTION) ** 4, 2)
    bau_2030 = next((r["total"] for r in bau if r["period"] == "2030"), bau[-1]["total"])
    gap = round(bau_2030 - target_2030, 2)

    # ---- readiness -------------------------------------------------------
    filled = sum(1 for c in CATEGORIES if activity[c] > 0)
    completeness = filled / len(CATEGORIES)
    scope3_cov = sum(1 for c in CATEGORIES if factors[c].scope == 3 and activity[c] > 0) / 4
    re_share = float(profile.get("renewable_share") or 0) / 100
    bench_component = (1 - (benchmark["percentile"] / 100)) if benchmark else 0.5
    readiness = round(100 * (0.35 * completeness + 0.20 * scope3_cov + 0.25 * bench_component + 0.20 * re_share))

    top = drivers[0] if drivers else None
    impacts = []
    if top:
        impacts.append(f"{top['label']} drives {top['share']:.0f}% of emissions — cutting it 10% avoids {top['cut10_tco2e']:.2f} tCO2e and about ₹{top['cut10_saving_inr']:,}/yr.")
    if benchmark:
        impacts.append(f"At {benchmark['per_employee']} t per employee you sit at the {benchmark['percentile']}th percentile of {industry} peers ({benchmark['verdict']}).")
    impacts.append(f"Doing nothing, emissions reach ~{bau_2030:,.1f} t by 2030; a 1.5°C-aligned path needs ≤{target_2030:,.1f} t — a gap of {max(gap, 0):,.1f} t.")
    impacts.append(f"Your footprint equals the yearly CO₂ absorbed by ~{equivalents(total)['trees_one_year']:,} trees.")

    return {
        **base,
        "industry": industry,
        "growth_rate": growth,
        "benchmark": benchmark,
        "uncertainty": mc,
        "drivers": drivers,
        "anomalies": anomalies,
        "forecast_bau": bau,
        "target": {
            "pathway": "1.5°C-aligned, 4.2% absolute reduction per year (SBTi cross-sector)",
            "base_year_total": total,
            "target_2030": target_2030,
            "bau_2030": bau_2030,
            "gap_2030": gap,
            "justification": f"Target = {total:,.2f} × (1 − 0.042)^4 = {target_2030:,.2f} t. BAU assumes {growth*100:.0f}%/yr growth, 1%/yr autonomous efficiency and 2%/yr grid decarbonisation (CEA trend).",
        },
        "readiness": {
            "score": readiness,
            "components": {
                "data_completeness": round(completeness * 100),
                "scope3_coverage": round(scope3_cov * 100),
                "peer_position": round(bench_component * 100),
                "renewable_share": round(re_share * 100),
            },
            "justification": "Readiness = 35% data completeness + 20% Scope 3 coverage + 25% peer position + 20% renewable electricity share.",
        },
        "equivalents": equivalents(total),
        "impacts": impacts,
    }
