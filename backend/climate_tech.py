"""
CarbonAI — Climate-tech switch engine.

A catalogue of decarbonisation technologies a company can "switch on".
For each switch we compute abatement (tCO2e/yr), capex (INR), annual saving
(INR), payback and a marginal abatement cost (MAC, INR per tCO2e), with the
calculation written out as a justification string.

Cost/price defaults are indicative Indian commercial figures and can be
overridden per request via `prices`.
"""

from __future__ import annotations

from emission_engine import DEFAULT_FACTORS, Factor

DEFAULT_PRICES = {
    "grid_tariff_inr_kwh": 8.0,        # commercial/industrial grid tariff
    "open_access_re_inr_kwh": 6.5,     # green open-access landed cost
    "petrol_inr_l": 103.0,
    "diesel_inr_l": 90.0,
    "gas_inr_m3": 50.0,
    "air_inr_km": 6.0,
    "landfill_inr_kg": 2.0,
    "solar_capex_inr_kw": 45000.0,
    "solar_yield_kwh_kw": 1400.0,      # Pune / west India rooftop yield
    "discount_rate": 0.08,
    "asset_life_years": 10,
}

# demand-side techs run first, supply-side (solar/PPA) last so they also
# cover electricity added by electrification.
CATALOGUE = [
    {
        "id": "efficiency",
        "name": "LED + HVAC + smart building controls",
        "scope": 2,
        "targets": ["electricity"],
        "max_reduction": 0.18,
        "maturity": "Proven",
        "simple": "Same work, less electricity — like switching every old bulb and AC to a 5-star one.",
        "policy": "BEE star-labelling; PAT scheme for designated consumers",
    },
    {
        "id": "ev_fleet",
        "name": "Electric vehicle fleet",
        "scope": 1,
        "targets": ["petrol", "diesel"],
        "max_reduction": 1.0,
        "maturity": "Scaling",
        "simple": "Swap fuel cars for EVs. You buy some electricity instead of a lot of petrol/diesel.",
        "policy": "PM E-DRIVE incentives; state EV policies (Maharashtra EV Policy 2025)",
    },
    {
        "id": "cng_biofuel",
        "name": "CNG / biodiesel blending for remaining vehicles & DG sets",
        "scope": 1,
        "targets": ["petrol", "diesel"],
        "max_reduction": 0.20,
        "maturity": "Proven",
        "simple": "Cleaner fuel in the same engines — a quick win while EVs roll out.",
        "policy": "National Policy on Biofuels; SATAT CBG programme",
    },
    {
        "id": "heat_pump",
        "name": "Electrify heat with industrial heat pumps",
        "scope": 1,
        "targets": ["natural_gas"],
        "max_reduction": 0.65,
        "maturity": "Scaling",
        "simple": "Heat pumps move heat instead of burning gas — about 3× more efficient.",
        "policy": "BEE energy-efficiency financing; CCTS (Indian carbon market)",
    },
    {
        "id": "rooftop_solar",
        "name": "Rooftop / on-site solar",
        "scope": 2,
        "targets": ["electricity"],
        "max_reduction": 0.40,
        "maturity": "Proven",
        "simple": "Make your own clean power on the roof — roughly 4–5 years to pay back.",
        "policy": "Net-metering / gross-metering rules (MERC); accelerated depreciation",
    },
    {
        "id": "green_ppa",
        "name": "Green open-access PPA / RE procurement",
        "scope": 2,
        "targets": ["electricity"],
        "max_reduction": 0.90,
        "maturity": "Proven",
        "simple": "Buy wind and solar power through the grid on a long contract — often cheaper than normal tariff.",
        "policy": "Green Energy Open Access Rules 2022 (≥100 kW consumers); RECs",
    },
    {
        "id": "travel_policy",
        "name": "Virtual-first travel + rail for < 500 km",
        "scope": 3,
        "targets": ["air_travel"],
        "max_reduction": 0.40,
        "maturity": "Proven",
        "simple": "Fewer flights: video calls for routine meetings, trains for short trips.",
        "policy": "Voluntary; supports BRSR Principle 6 disclosures",
    },
    {
        "id": "green_hotels",
        "name": "Certified green hotel programme",
        "scope": 3,
        "targets": ["hotels"],
        "max_reduction": 0.30,
        "maturity": "Proven",
        "simple": "Book hotels that run on cleaner energy — same trip, smaller footprint.",
        "policy": "IGBC / GRIHA certified properties",
    },
    {
        "id": "commute_program",
        "name": "EV shuttles + hybrid-work days",
        "scope": 3,
        "targets": ["commuting"],
        "max_reduction": 0.40,
        "maturity": "Proven",
        "simple": "Shared electric shuttles and 1–2 work-from-home days cut daily travel.",
        "policy": "State EV bus aggregation schemes",
    },
    {
        "id": "waste_circular",
        "name": "Segregation, composting & recycling",
        "scope": 3,
        "targets": ["waste"],
        "max_reduction": 0.65,
        "maturity": "Proven",
        "simple": "Sort waste so less of it rots in landfill and releases methane.",
        "policy": "Solid Waste Management Rules 2016; EPR for plastics",
    },
]

CATALOGUE_BY_ID = {t["id"]: t for t in CATALOGUE}

# share of diesel assumed to be vehicles (rest = DG sets etc.)
DIESEL_VEHICLE_SHARE = 0.6
EV_KWH_PER_L_PETROL = 1.8
EV_KWH_PER_L_DIESEL = 2.2
HEATPUMP_KWH_PER_M3 = 3.5


def _crf(rate: float, years: int) -> float:
    """Capital recovery factor — annualises capex."""
    if rate <= 0:
        return 1 / years
    return rate * (1 + rate) ** years / ((1 + rate) ** years - 1)


def apply_switches(
    activity: dict[str, float],
    switches: dict[str, float],
    factors: dict[str, Factor] | None = None,
    prices: dict | None = None,
) -> dict:
    """
    activity : annual activity per category (kWh, L, km...)
    switches : {tech_id: adoption 0..1}
    Returns new activity, per-tech results and totals.
    """
    factors = factors or DEFAULT_FACTORS
    p = {**DEFAULT_PRICES, **(prices or {})}
    act = {k: float(v) for k, v in activity.items()}
    crf = _crf(p["discount_rate"], int(p["asset_life_years"]))

    def emis(a: dict) -> float:
        return sum(a[c] * factors[c].value for c in a)

    results = []
    for tech in CATALOGUE:
        adoption = max(0.0, min(1.0, float(switches.get(tech["id"], 0) or 0)))
        if adoption <= 0:
            continue

        before = emis(act)
        capex = 0.0
        saving = 0.0
        notes = []
        r = tech["max_reduction"] * adoption
        tid = tech["id"]

        if tid == "efficiency":
            kwh = act["electricity"] * r
            act["electricity"] -= kwh
            capex = kwh * 20.0
            saving = kwh * p["grid_tariff_inr_kwh"]
            notes.append(f"{kwh:,.0f} kWh/yr avoided at ₹{p['grid_tariff_inr_kwh']}/kWh")

        elif tid == "ev_fleet":
            petrol_l = act["petrol"] * r
            diesel_l = act["diesel"] * DIESEL_VEHICLE_SHARE * r
            added_kwh = petrol_l * EV_KWH_PER_L_PETROL + diesel_l * EV_KWH_PER_L_DIESEL
            act["petrol"] -= petrol_l
            act["diesel"] -= diesel_l
            act["electricity"] += added_kwh
            capex = (petrol_l + diesel_l) * 420.0  # ~₹5 lakh EV premium per ~1,200 L/yr vehicle
            saving = petrol_l * p["petrol_inr_l"] + diesel_l * p["diesel_inr_l"] - added_kwh * p["grid_tariff_inr_kwh"]
            notes.append(f"{petrol_l + diesel_l:,.0f} L fuel displaced, +{added_kwh:,.0f} kWh charging (counted in Scope 2)")

        elif tid == "cng_biofuel":
            petrol_l = act["petrol"] * r
            diesel_l = act["diesel"] * r
            act["petrol"] -= petrol_l
            act["diesel"] -= diesel_l
            capex = (petrol_l + diesel_l) * 60.0
            saving = (petrol_l + diesel_l) * 20.0
            notes.append(f"{tech['max_reduction']*100:.0f}% lower-carbon fuel share at {adoption*100:.0f}% adoption")

        elif tid == "heat_pump":
            m3 = act["natural_gas"] * r
            added_kwh = m3 * HEATPUMP_KWH_PER_M3
            act["natural_gas"] -= m3
            act["electricity"] += added_kwh
            capex = m3 * 900.0
            saving = m3 * p["gas_inr_m3"] - added_kwh * p["grid_tariff_inr_kwh"]
            notes.append(f"{m3:,.0f} m³ gas replaced by {added_kwh:,.0f} kWh (COP≈3)")

        elif tid == "rooftop_solar":
            kwh = act["electricity"] * r
            kw = kwh / p["solar_yield_kwh_kw"]
            act["electricity"] -= kwh
            capex = kw * p["solar_capex_inr_kw"]
            saving = kwh * p["grid_tariff_inr_kwh"] - capex * 0.01
            notes.append(f"≈{kw:,.0f} kWp system generating {kwh:,.0f} kWh/yr")

        elif tid == "green_ppa":
            kwh = act["electricity"] * r
            act["electricity"] -= kwh
            capex = 0.0
            saving = kwh * (p["grid_tariff_inr_kwh"] - p["open_access_re_inr_kwh"])
            notes.append(f"{kwh:,.0f} kWh/yr sourced from renewables via open access")

        elif tid == "travel_policy":
            km = act["air_travel"] * r
            act["air_travel"] -= km
            capex = 500000.0 * adoption
            saving = km * p["air_inr_km"]
            notes.append(f"{km:,.0f} passenger-km of flying avoided")

        elif tid == "green_hotels":
            nights = act["hotels"] * r
            act["hotels"] -= nights
            notes.append(f"{nights:,.0f} room-night equivalents decarbonised")

        elif tid == "commute_program":
            km = act["commuting"] * r
            act["commuting"] -= km
            capex = km * 1.5
            notes.append(f"{km:,.0f} commute passenger-km avoided")

        elif tid == "waste_circular":
            kg = act["waste"] * r
            act["waste"] -= kg
            capex = kg * 3.0
            saving = kg * p["landfill_inr_kg"]
            notes.append(f"{kg:,.0f} kg diverted from landfill")

        after = emis(act)
        abated = before - after  # can be negative (e.g. electrifying heat on a coal-heavy grid)
        annualised = capex * crf
        mac = ((annualised - saving) / abated) if abated > 0 else None
        payback = (capex / saving) if saving > 0 and capex > 0 else (0.0 if capex == 0 else None)

        results.append({
            "id": tid,
            "name": tech["name"],
            "scope": tech["scope"],
            "adoption": round(adoption, 2),
            "abatement_tco2e": round(abated, 3),
            "capex_inr": round(capex),
            "annual_saving_inr": round(saving),
            "payback_years": None if payback is None else round(payback, 1),
            "mac_inr_per_tco2e": None if mac is None else round(mac),
            "simple": tech["simple"],
            "policy": tech["policy"],
            "warning": (
                "Increases emissions on today's grid — pair with rooftop solar or a green PPA."
                if abated < 0 else None
            ),
            "justification": (
                f"{'; '.join(notes)}. Abatement = emissions before − after this switch "
                f"({before:,.2f} → {after:,.2f} tCO2e). MAC = (capex × CRF {crf:.3f} − annual saving) ÷ abatement."
            ),
        })

    return {
        "activity_after": {k: round(v, 3) for k, v in act.items()},
        "switches": results,
        "total_abatement_tco2e": round(sum(r["abatement_tco2e"] for r in results), 3),
        "total_capex_inr": round(sum(r["capex_inr"] for r in results)),
        "total_annual_saving_inr": round(sum(r["annual_saving_inr"] for r in results)),
        "prices_used": p,
    }


def mac_curve(activity: dict[str, float], factors: dict[str, Factor] | None = None, prices: dict | None = None) -> list[dict]:
    """Each tech evaluated alone at 100% adoption, sorted cheapest-first (a MAC curve)."""
    rows = []
    for tech in CATALOGUE:
        res = apply_switches(activity, {tech["id"]: 1.0}, factors, prices)["switches"]
        if res and res[0]["abatement_tco2e"] != 0:
            rows.append(res[0])
    rows.sort(key=lambda r: (r["abatement_tco2e"] <= 0, r["mac_inr_per_tco2e"] if r["mac_inr_per_tco2e"] is not None else 1e12))
    return rows
