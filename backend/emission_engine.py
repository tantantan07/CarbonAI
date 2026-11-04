"""
CarbonAI — emission calculation core (GHG Protocol Scope 1 / 2 / 3).

All factors are tCO2e per activity unit so that value * factor = tCO2e.
If the Supabase `emission_factors` table has a row for a category it wins;
otherwise these documented defaults are used.
"""

from __future__ import annotations

from dataclasses import dataclass

CATEGORIES = [
    "electricity",
    "natural_gas",
    "petrol",
    "diesel",
    "air_travel",
    "hotels",
    "commuting",
    "waste",
]


@dataclass(frozen=True)
class Factor:
    value: float          # tCO2e per unit
    unit: str
    scope: int
    label: str
    source: str
    uncertainty: float    # +/- fraction (1 sigma) used for Monte Carlo


DEFAULT_FACTORS: dict[str, Factor] = {
    "electricity": Factor(0.000727, "kWh", 2, "Purchased electricity",
                          "CEA CO2 Baseline Database v20 (FY2023-24), RE-adjusted weighted average 0.727 tCO2/MWh", 0.05),
    "natural_gas": Factor(0.00202, "m³", 1, "Natural gas (stationary combustion)",
                          "DEFRA/IPCC stationary combustion default", 0.04),
    "petrol": Factor(0.00231, "L", 1, "Petrol (company vehicles)",
                     "IPCC 2006 mobile combustion default", 0.03),
    "diesel": Factor(0.00268, "L", 1, "Diesel (vehicles / DG sets)",
                     "IPCC 2006 mobile/stationary combustion default", 0.03),
    "air_travel": Factor(0.00015, "passenger-km", 3, "Business air travel",
                         "DEFRA average passenger-km factor", 0.20),
    "hotels": Factor(0.03, "room-nights", 3, "Hotel stays",
                     "Cornell Hotel Sustainability Benchmarking (India avg)", 0.30),
    "commuting": Factor(0.00012, "passenger-km", 3, "Employee commuting",
                        "Blended Indian urban mode-mix estimate", 0.25),
    "waste": Factor(0.0005, "kg", 3, "Waste to landfill",
                    "IPCC waste model, mixed MSW to landfill", 0.40),
}

SCOPE_NAMES = {
    1: "Scope 1 — Direct emissions",
    2: "Scope 2 — Purchased energy",
    3: "Scope 3 — Value chain",
}

SCOPE_OF = {cat: f.scope for cat, f in DEFAULT_FACTORS.items()}


def resolve_factors(db_rows: list[dict] | None = None) -> dict[str, Factor]:
    factors = dict(DEFAULT_FACTORS)
    for row in db_rows or []:
        cat = row.get("category")
        val = row.get("factor_value")
        if cat in factors and val not in (None, ""):
            base = factors[cat]
            factors[cat] = Factor(float(val), base.unit, base.scope, base.label,
                                  "CarbonAI Supabase emission_factors table", base.uncertainty)
    return factors


def annualise(inputs: dict, period: str = "annual") -> dict[str, float]:
    mult = {"annual": 1, "yearly": 1, "quarterly": 4, "monthly": 12}.get((period or "annual").lower(), 1)
    return {cat: max(float(inputs.get(cat) or 0), 0.0) * mult for cat in CATEGORIES}


def calculate(inputs: dict, factors: dict[str, Factor] | None = None, period: str = "annual") -> dict:
    factors = factors or DEFAULT_FACTORS
    activity = annualise(inputs, period)

    category_totals = {cat: activity[cat] * factors[cat].value for cat in CATEGORIES}
    total = sum(category_totals.values())

    scopes = {1: 0.0, 2: 0.0, 3: 0.0}
    for cat, val in category_totals.items():
        scopes[factors[cat].scope] += val

    return {
        "activity": activity,
        "category_totals": {k: round(v, 3) for k, v in category_totals.items()},
        "scope_totals": {f"scope{k}": round(v, 3) for k, v in scopes.items()},
        "total_tco2e": round(total, 3),
        "shares": {k: (round(v / total * 100, 1) if total else 0) for k, v in category_totals.items()},
        "factors_used": {
            cat: {"value": f.value, "unit": f.unit, "scope": f.scope, "label": f.label, "source": f.source}
            for cat, f in factors.items()
        },
        "formula": "tCO2e = Σ (annual activity × emission factor)",
    }
