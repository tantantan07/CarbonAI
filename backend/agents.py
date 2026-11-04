"""
CarbonAI — personified, scope-specific AI agents.

Each agent has a name, a personality, a scope of responsibility and a
system prompt that is personalised with the company profile and only the
slice of the analysis that agent owns. All inference goes through
llm_provider (Nugen aligned model by default).
"""

from __future__ import annotations

import asyncio

from climate_tech import mac_curve
from llm_provider import chat

AGENTS: dict[str, dict] = {
    "terra": {
        "name": "Terra",
        "title": "Your sustainability guide",
        "scope": "all",
        "audience": "everyone",
        "color": "#91e5aa",
        "tagline": "Explains your footprint in plain words — no jargon.",
        "personality": "warm, patient teacher who uses everyday Indian analogies (electricity bills, auto-rickshaws, monsoon), short sentences and never assumes prior knowledge",
        "focus": "explaining what the numbers mean, what Scope 1/2/3 are, and what the user can do first",
    },
    "ignis": {
        "name": "Ignis",
        "title": "Scope 1 specialist — fuels & fleet",
        "scope": 1,
        "audience": "operations",
        "color": "#ff9b6b",
        "tagline": "Owns everything you burn: diesel, petrol, gas, DG sets.",
        "personality": "practical plant-floor engineer, direct and numbers-first",
        "focus": "direct combustion emissions: vehicles, DG sets, boilers; EV transition, fuel switching, heat pumps",
    },
    "volt": {
        "name": "Volt",
        "title": "Scope 2 specialist — electricity",
        "scope": 2,
        "audience": "facilities",
        "color": "#ffd166",
        "tagline": "Knows the Indian grid, open access, solar and RECs.",
        "personality": "energetic energy-markets analyst who knows Indian power regulation",
        "focus": "purchased electricity: efficiency, rooftop solar, Green Energy Open Access, RECs, grid emission factor (CEA)",
    },
    "atlas": {
        "name": "Atlas",
        "title": "Scope 3 specialist — value chain",
        "scope": 3,
        "audience": "procurement & HR",
        "color": "#7cc6fe",
        "tagline": "Maps travel, commuting, waste and suppliers.",
        "personality": "systems thinker and supply-chain strategist, calm and thorough",
        "focus": "value-chain emissions: business travel, hotels, employee commuting, waste, supplier engagement",
    },
    "sage": {
        "name": "Sage",
        "title": "CEO strategy advisor",
        "scope": "all",
        "audience": "ceo",
        "color": "#c9a7ff",
        "tagline": "Board-ready: cost, risk, compliance and ROI.",
        "personality": "concise boardroom strategist; leads with the decision, then money, risk and timeline",
        "focus": "capital allocation, payback, regulatory exposure (SEBI BRSR Core, CCTS carbon market, EU CBAM for exporters), brand and investor expectations",
    },
    "lex": {
        "name": "Lex",
        "title": "Assurance & disclosure analyst",
        "scope": "all",
        "audience": "stakeholder",
        "color": "#e6e6e6",
        "tagline": "Shows third parties how every number was made.",
        "personality": "neutral, precise auditor; transparent about assumptions and uncertainty",
        "focus": "methodology (GHG Protocol), emission-factor sources, data quality, uncertainty, what a verifier would check",
    },
    "archivist": {
        "name": "Archivist",
        "title": "Document agent",
        "scope": "all",
        "audience": "everyone",
        "color": "#b8e0c8",
        "tagline": "Reads your bills and sheets, sorts them and pulls the numbers out.",
        "personality": "meticulous records clerk",
        "focus": "classifying documents into emission categories and extracting activity data with evidence",
    },
}

EXPERTISE_STYLE = {
    "beginner": "The reader is new to carbon accounting: define every term, use analogies, keep it under 180 words.",
    "intermediate": "The reader knows the basics: be clear and practical, under 250 words.",
    "expert": "The reader is a sustainability professional: be technical and precise, cite methods, under 300 words.",
}


def public_agents() -> list[dict]:
    return [{"id": k, **{f: v[f] for f in ("name", "title", "scope", "audience", "color", "tagline")}} for k, v in AGENTS.items()]


def _scope_ok(agent_scope, scope: int) -> bool:
    return agent_scope == "all" or agent_scope == scope


def build_context(agent_id: str, profile: dict, analysis: dict) -> str:
    agent = AGENTS[agent_id]
    sc = agent["scope"]
    lines = [
        f"Company: {profile.get('name') or 'the company'} | Industry: {analysis.get('industry')} | "
        f"Location: {profile.get('location') or 'India'} | Employees: {profile.get('employees') or 'n/a'}",
    ]
    if profile.get("goals"):
        lines.append(f"Company goals: {profile['goals']}")
    if profile.get("priorities"):
        lines.append(f"Priorities: {', '.join(profile['priorities']) if isinstance(profile['priorities'], list) else profile['priorities']}")
    if profile.get("budget"):
        lines.append(f"Budget appetite: {profile['budget']}")

    s = analysis["scope_totals"]
    lines.append(f"Total footprint: {analysis['total_tco2e']:,.2f} tCO2e/yr "
                 f"(Scope 1 {s['scope1']:,.2f}, Scope 2 {s['scope2']:,.2f}, Scope 3 {s['scope3']:,.2f}).")
    u = analysis.get("uncertainty") or {}
    if u:
        lines.append(f"80% confidence range: {u['p10']:,.1f}–{u['p90']:,.1f} tCO2e.")

    drivers = [d for d in analysis.get("drivers", []) if _scope_ok(sc, d["scope"])]
    if drivers:
        lines.append("Emission sources (largest first):")
        for d in drivers[:6]:
            lines.append(f"- {d['label']} (Scope {d['scope']}): {d['tco2e']:,.2f} t = {d['share']}%; "
                         f"10% cut saves {d['cut10_tco2e']:,.2f} t and ₹{d['cut10_saving_inr']:,}/yr")

    b = analysis.get("benchmark")
    if b:
        lines.append(f"Benchmark: {b['per_employee']} t/employee vs peer median {b['peer_median']} → {b['percentile']}th percentile ({b['verdict']}).")
    t = analysis.get("target") or {}
    if t:
        lines.append(f"2030: business-as-usual {t['bau_2030']:,.1f} t vs 1.5°C target {t['target_2030']:,.1f} t (gap {t['gap_2030']:,.1f} t).")

    flags = [a for a in analysis.get("anomalies", []) if sc == "all" or AGENT_CATS.get(sc, set()) & {a["category"]}]
    if flags:
        lines.append("Data checks: " + " | ".join(a["message"] for a in flags[:4]))

    macs = [m for m in analysis.get("mac_curve", []) if _scope_ok(sc, m["scope"])]
    if macs:
        lines.append("Climate-tech options (full adoption, cheapest per tonne first):")
        for m in macs[:5]:
            pay = f"{m['payback_years']} yr payback" if m["payback_years"] not in (None, 0) else "no capex"
            lines.append(f"- {m['name']}: −{m['abatement_tco2e']:,.2f} t/yr, capex ₹{m['capex_inr']:,}, {pay}, MAC ₹{m['mac_inr_per_tco2e']}/t")
    return "\n".join(lines)


AGENT_CATS = {1: {"natural_gas", "petrol", "diesel"}, 2: {"electricity"}, 3: {"air_travel", "hotels", "commuting", "waste"}}


def system_prompt(agent_id: str, profile: dict, analysis: dict) -> str:
    a = AGENTS[agent_id]
    level = (profile.get("expertise") or "beginner").lower()
    scope_rule = ("You cover all scopes." if a["scope"] == "all"
                  else f"You ONLY advise on Scope {a['scope']}. If asked about other scopes, answer in one line and name the right colleague (Ignis=Scope 1, Volt=Scope 2, Atlas=Scope 3).")
    return f"""You are {a['name']}, {a['title']} inside CarbonAI, an AI carbon-intelligence platform for Indian businesses.
Personality: {a['personality']}.
Focus: {a['focus']}.
{scope_rule}
{EXPERTISE_STYLE.get(level, EXPERTISE_STYLE['beginner'])}

You are speaking to {profile.get('contact_name') or 'the team'} at {profile.get('name') or 'the company'}. Personalise every answer to their industry, size, location and goals.
Use ONLY the figures in the company data below — never invent numbers. If data is missing, say what to collect.

Always answer in this markdown structure:
**Answer** — the direct answer or recommendation.
**Why** — the justification: which numbers, factors or assumptions it is based on.
**Next step** — one concrete action with an owner and timeframe.

COMPANY DATA
{build_context(agent_id, profile, analysis)}"""


def offline_answer(agent_id: str, profile: dict, analysis: dict, question: str | None = None) -> str:
    """Deterministic, data-grounded answer used when no model is reachable."""
    a = AGENTS[agent_id]
    sc = a["scope"]
    drivers = [d for d in analysis.get("drivers", []) if _scope_ok(sc, d["scope"])]
    macs = [m for m in analysis.get("mac_curve", []) if _scope_ok(sc, m["scope"])]
    company = profile.get("name") or "your company"
    if not drivers:
        return (f"**Answer** — {company} has no reported activity in my area yet.\n\n"
                f"**Why** — every category I own is zero in the assessment.\n\n"
                f"**Next step** — collect last 12 months of the relevant bills and upload them to the Document agent.")
    top = drivers[0]
    # prefer the biggest cut that pays for itself; otherwise the cheapest per tonne
    saving_moves = [m for m in macs if m["abatement_tco2e"] > 0 and (m["mac_inr_per_tco2e"] or 0) <= 0]
    best = max(saving_moves, key=lambda m: m["abatement_tco2e"]) if saving_moves else (macs[0] if macs else None)
    rec = (f"Start with **{best['name']}**: about {best['abatement_tco2e']:,.2f} tCO2e/yr avoided"
           + (f", ~{best['payback_years']} yr payback." if best and best["payback_years"] else ".")) if best else "Reduce the largest source first."
    t = analysis.get("target", {})
    if agent_id == "sage":
        return (f"**Answer** — {company} emits {analysis['total_tco2e']:,.1f} tCO2e/yr. {rec}\n\n"
                f"**Why** — {top['label']} is {top['share']}% of the footprint; on today's path 2030 emissions reach "
                f"{t.get('bau_2030', 0):,.1f} t against a 1.5°C limit of {t.get('target_2030', 0):,.1f} t.\n\n"
                f"**Next step** — approve a costed pilot this quarter and assign an owner for BRSR Core data.")
    if agent_id == "lex":
        u = analysis.get("uncertainty", {})
        return (f"**Answer** — Footprint {analysis['total_tco2e']:,.2f} tCO2e (80% range {u.get('p10')}–{u.get('p90')} t), "
                f"calculated under the GHG Protocol Corporate Standard.\n\n"
                f"**Why** — activity data × published factors (CEA v20 grid factor for electricity, IPCC/DEFRA for fuels and travel). "
                f"{len(analysis.get('anomalies', []))} data-quality flags are open.\n\n"
                f"**Next step** — attach source invoices for the top category ({top['label']}) for verification.")
    eq = analysis.get("equivalents", {})
    return (f"**Answer** — Your biggest source here is **{top['label']}** at {top['tco2e']:,.2f} tCO2e ({top['share']}%). {rec}\n\n"
            f"**Why** — {top['justification']} A 10% cut is worth {top['cut10_tco2e']:,.2f} t and ₹{top['cut10_saving_inr']:,} a year. "
            + (f"In everyday terms, your whole footprint equals what ~{eq.get('trees_one_year', 0):,} trees absorb in a year." if agent_id == 'terra' else "")
            + "\n\n**Next step** — try this lever in the Scenario planner and compare payback.")


def enrich(analysis: dict) -> dict:
    if "mac_curve" not in analysis:
        analysis = {**analysis, "mac_curve": mac_curve(analysis["activity"])}
    return analysis


async def ask(agent_id: str, profile: dict, analysis: dict, messages: list[dict], provider: str | None = None) -> dict:
    if agent_id not in AGENTS:
        raise KeyError(agent_id)
    analysis = enrich(analysis)
    convo = [{"role": "system", "content": system_prompt(agent_id, profile, analysis)}]
    for m in messages[-8:]:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            convo.append({"role": m["role"], "content": str(m["content"])[:2000]})
    if len(convo) == 1:
        convo.append({"role": "user", "content": "Give me your top insight and recommendation for us."})
    last_q = next((m["content"] for m in reversed(convo) if m["role"] == "user"), None)

    result = await chat(convo, provider=provider, offline_text=offline_answer(agent_id, profile, analysis, last_q))
    return {
        "agent": agent_id,
        "name": AGENTS[agent_id]["name"],
        "reply": result.text,
        "meta": result.meta,
        "grounding": build_context(agent_id, profile, analysis),
    }


def prompt_messages(agent_id: str, profile: dict, analysis: dict, messages: list[dict]) -> list[dict]:
    """Used by the browser-side LM Studio mode: the backend builds the prompt, the browser runs it locally."""
    analysis = enrich(analysis)
    convo = [{"role": "system", "content": system_prompt(agent_id, profile, analysis)}]
    convo += [{"role": m["role"], "content": m["content"]} for m in messages[-8:] if m.get("role") in ("user", "assistant")]
    if len(convo) == 1:
        convo.append({"role": "user", "content": "Give me your top insight and recommendation for us."})
    return convo


async def scope_briefing(profile: dict, analysis: dict, provider: str | None = None, agent_ids=("ignis", "volt", "atlas", "sage")) -> list[dict]:
    """All scoped agents analyse the company in parallel."""
    analysis = enrich(analysis)
    tasks = [ask(aid, profile, analysis, [], provider) for aid in agent_ids]
    return list(await asyncio.gather(*tasks))
