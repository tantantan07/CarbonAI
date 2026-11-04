"""
CarbonAI API v2 — Round 2 (Indradhanu Hackathon 2026).

All endpoints are stateless: the client sends the company profile and
activity inputs, so they work for signed-in and guest users alike.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

import agents as agent_mod
import documents as doc_mod
import llm_provider
import reports as report_mod
from climate_tech import CATALOGUE, apply_switches, mac_curve
from emission_engine import CATEGORIES, DEFAULT_FACTORS, annualise
from ml_engine import analyze
from scenarios import compare

router = APIRouter(prefix="/v2", tags=["v2"])

_factor_loader = None  # set by main.py to pull Supabase factors when available


def set_factor_loader(fn):
    global _factor_loader
    _factor_loader = fn


def _factors(industry: str | None):
    if _factor_loader:
        try:
            return _factor_loader(industry)
        except Exception:  # noqa: BLE001 — DB issues must not break analysis
            pass
    return DEFAULT_FACTORS


class Profile(BaseModel):
    name: str | None = None
    industry: str | None = "general"
    employees: int | None = None
    location: str | None = None
    revenue_cr: float | None = None
    renewable_share: float | None = 0
    growth_rate: float | None = None
    period: str | None = "annual"
    goals: str | None = None
    priorities: list[str] | str | None = None
    budget: str | None = None
    expertise: str | None = "beginner"
    contact_name: str | None = None


class Inputs(BaseModel):
    electricity: float = 0
    natural_gas: float = 0
    petrol: float = 0
    diesel: float = 0
    air_travel: float = 0
    hotels: float = 0
    commuting: float = 0
    waste: float = 0


class AnalyzeRequest(BaseModel):
    profile: Profile = Field(default_factory=Profile)
    inputs: Inputs = Field(default_factory=Inputs)


class ChatRequest(AnalyzeRequest):
    messages: list[dict[str, Any]] = Field(default_factory=list)


class SwitchRequest(AnalyzeRequest):
    switches: dict[str, float] = Field(default_factory=dict)
    prices: dict[str, float] | None = None


class ScenarioRequest(AnalyzeRequest):
    scenarios: list[dict[str, Any]]


class ReportRequest(AnalyzeRequest):
    audience: str = "ceo"
    scenarios: list[dict[str, Any]] | None = None
    include_ai: bool = True


def _run(req: AnalyzeRequest) -> tuple[dict, dict, dict]:
    profile = req.profile.model_dump()
    factors = _factors(profile.get("industry"))
    analysis = analyze(req.inputs.model_dump(), profile, factors)
    return profile, analysis, factors


# ------------------------------------------------------------------ meta
@router.get("/llm/status")
def llm_status():
    return llm_provider.status()


@router.get("/agents")
def list_agents():
    return agent_mod.public_agents()


@router.get("/climate-tech")
def list_climate_tech():
    return CATALOGUE


@router.get("/factors")
def factors():
    return {c: {"value": f.value, "unit": f.unit, "scope": f.scope, "label": f.label, "source": f.source,
                "uncertainty": f.uncertainty} for c, f in DEFAULT_FACTORS.items()}


# ------------------------------------------------------------------ analytics
@router.post("/analyze")
def analyze_endpoint(req: AnalyzeRequest):
    profile, analysis, factors = _run(req)
    analysis["mac_curve"] = mac_curve(analysis["activity"], factors)
    return analysis


@router.post("/climate-tech/simulate")
def simulate_switches(req: SwitchRequest):
    profile, analysis, factors = _run(req)
    res = apply_switches(analysis["activity"], req.switches, factors, req.prices)
    before = analysis["total_tco2e"]
    after = round(before - res["total_abatement_tco2e"], 3)
    res.update({
        "before_tco2e": before,
        "after_tco2e": after,
        "reduction_pct": round((1 - after / before) * 100, 1) if before else 0,
        "impacts": [
            f"These switches cut {res['total_abatement_tco2e']:,.2f} tCO2e/yr ({round((1 - after / before) * 100, 1) if before else 0}%).",
            f"Up-front investment ₹{res['total_capex_inr']:,} with ₹{res['total_annual_saving_inr']:,} saved every year.",
        ],
    })
    return res


@router.post("/scenarios")
def scenarios_endpoint(req: ScenarioRequest):
    profile, analysis, factors = _run(req)
    return compare(analysis["activity"], req.scenarios, analysis["growth_rate"], factors)


# ------------------------------------------------------------------ agents
@router.post("/agents/{agent_id}/chat")
async def agent_chat(agent_id: str, req: ChatRequest, x_llm_provider: str | None = Header(default=None)):
    if agent_id not in agent_mod.AGENTS:
        raise HTTPException(404, f"Unknown agent '{agent_id}'")
    profile, analysis, factors = _run(req)
    analysis["mac_curve"] = mac_curve(analysis["activity"], factors)
    return await agent_mod.ask(agent_id, profile, analysis, req.messages, provider=x_llm_provider)


@router.post("/agents/{agent_id}/prompt")
def agent_prompt(agent_id: str, req: ChatRequest):
    """Returns the fully personalised prompt so the browser can run it on a local LM Studio."""
    if agent_id not in agent_mod.AGENTS:
        raise HTTPException(404, f"Unknown agent '{agent_id}'")
    profile, analysis, factors = _run(req)
    analysis["mac_curve"] = mac_curve(analysis["activity"], factors)
    return {"messages": agent_mod.prompt_messages(agent_id, profile, analysis, req.messages)}


@router.post("/insights")
async def insights(req: AnalyzeRequest, x_llm_provider: str | None = Header(default=None)):
    profile, analysis, factors = _run(req)
    analysis["mac_curve"] = mac_curve(analysis["activity"], factors)
    return {"briefings": await agent_mod.scope_briefing(profile, analysis, provider=x_llm_provider)}


# ------------------------------------------------------------------ documents
@router.post("/documents/upload")
async def upload_documents(files: list[UploadFile] = File(...), x_llm_provider: str | None = Header(default=None)):
    if len(files) > 15:
        raise HTTPException(400, "Upload at most 15 files at a time")
    payload = []
    for f in files:
        data = await f.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(413, f"{f.filename} is larger than 10 MB")
        payload.append((f.filename or "file", data))
    result = doc_mod.process(payload)

    note = await llm_provider.chat(
        [
            {"role": "system", "content": "You are Archivist, CarbonAI's document agent. In 3 short bullet points, tell the user what you found in their documents, what looks missing for a complete Scope 1/2/3 inventory, and one thing to double-check. Use only the data given."},
            {"role": "user", "content": doc_mod.summary_for_llm(result)},
        ],
        provider=x_llm_provider, max_tokens=300,
        offline_text=_doc_offline_note(result),
    )
    result["agent_note"] = note.text
    result["meta"] = note.meta
    return result


def _doc_offline_note(result: dict) -> str:
    have = set(result["suggested_inputs"])
    missing = [DEFAULT_FACTORS[c].label for c in CATEGORIES if c not in have]
    return (f"- Sorted {len(result['documents'])} file(s) into {len(result['groups'])} group(s).\n"
            f"- Found values for: {', '.join(DEFAULT_FACTORS[c].label for c in have) or 'nothing yet'}.\n"
            f"- Still missing: {', '.join(missing[:4]) or 'nothing — inventory looks complete'}.")


@router.get("/documents/template")
def download_template():
    return Response(report_mod.build_template(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="carbonai-data-template.xlsx"'})


# ------------------------------------------------------------------ reports
async def _report_parts(req: ReportRequest, provider: str | None):
    profile, analysis, factors = _run(req)
    mac = mac_curve(analysis["activity"], factors)
    analysis["mac_curve"] = mac
    scn = compare(analysis["activity"], req.scenarios, analysis["growth_rate"], factors) if req.scenarios else None
    narrative = None
    if req.include_ai:
        agent_id = "sage" if req.audience == "ceo" else "lex"
        q = ("Write a 120-word executive summary for the board: the headline, the top 3 actions with rupee impact, and the decision needed."
             if agent_id == "sage" else
             "Write a 120-word neutral disclosure statement for investors and auditors: footprint, method, uncertainty and data-quality caveats.")
        res = await agent_mod.ask(agent_id, profile, analysis, [{"role": "user", "content": q}], provider=provider)
        narrative = res["reply"] + f"\n(Model: {res['meta'].get('provider')} / {res['meta'].get('model')})"
    return profile, analysis, scn, narrative, mac


@router.post("/reports/pdf")
async def report_pdf(req: ReportRequest, x_llm_provider: str | None = Header(default=None)):
    profile, analysis, scn, narrative, mac = await _report_parts(req, x_llm_provider)
    pdf = report_mod.build_pdf(profile, analysis, req.audience, scn, narrative, mac)
    name = f"carbonai-{'ceo-brief' if req.audience == 'ceo' else 'disclosure'}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/reports/xlsx")
async def report_xlsx(req: ReportRequest, x_llm_provider: str | None = Header(default=None)):
    profile, analysis, scn, narrative, mac = await _report_parts(req, x_llm_provider)
    data = report_mod.build_xlsx(profile, analysis, req.audience, scn, narrative, mac)
    name = f"carbonai-{'ceo-brief' if req.audience == 'ceo' else 'disclosure'}.xlsx"
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/reports/json")
async def report_json(req: ReportRequest, x_llm_provider: str | None = Header(default=None)):
    profile, analysis, scn, narrative, mac = await _report_parts(req, x_llm_provider)
    return {"profile": profile, "analysis": analysis, "scenarios": scn, "narrative": narrative}
