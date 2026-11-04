import os
from fastapi import FastAPI
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from emission_engine import resolve_factors, calculate as engine_calculate
import routes_v2

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# Supabase is optional: v2 analytics/agents/reports work without it (guest mode, local dev).
supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
supabase_admin: Client | None = (
    create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_KEY else None
)
app = FastAPI(title="CarbonAI Backend", version="2.0.0")


def load_factor_rows(industry: str | None):
    if not supabase:
        return resolve_factors(None)
    rows = supabase.table("emission_factors").select("*").eq("industry", industry or "general").execute().data
    if not rows:
        rows = supabase.table("emission_factors").select("*").eq("industry", "general").execute().data
    return resolve_factors(rows)


routes_v2.set_factor_loader(load_factor_rows)
app.include_router(routes_v2.router)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.environ.get(
            "CORS_ORIGINS",
            "https://carbon-ai-ten.vercel.app,http://localhost:5173,http://localhost:4173",
        ).split(",")
    ],
    allow_origin_regex=r"https://carbon-ai.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.get("/")
def read_root():
    return {"message": "CarbonAI backend is running!"}

@app.get("/health")
def health_check():
    import llm_provider
    return {"status": "ok", "supabase": bool(supabase), "llm": llm_provider.status()}

@app.get("/emission-factors")
def get_emission_factors():
    response = supabase.table("emission_factors").select("*").execute()
    return response.data


class EmissionInput(BaseModel):
    industry: str = "general"
    electricity: float = 0
    natural_gas: float = 0
    petrol: float = 0
    diesel: float = 0
    air_travel: float = 0
    hotels: float = 0
    commuting: float = 0
    waste: float = 0


@app.post("/calculate")
def calculate_footprint(data: EmissionInput):
    response = (
        supabase.table("emission_factors")
        .select("*")
        .eq("industry", data.industry)
        .execute()
    )
    factors = response.data

    if not factors:
        response = (
            supabase.table("emission_factors")
            .select("*")
            .eq("industry", "general")
            .execute()
        )
        factors = response.data

    factor_map = {f["category"]: f["factor_value"] for f in factors}

    inputs = {
        "electricity": data.electricity,
        "natural_gas": data.natural_gas,
        "petrol": data.petrol,
        "diesel": data.diesel,
        "air_travel": data.air_travel,
        "hotels": data.hotels,
        "commuting": data.commuting,
        "waste": data.waste,
    }

    category_totals = {}
    for category, value in inputs.items():
        factor = factor_map.get(category, 0)
        category_totals[category] = round(value * factor, 2)

    total = round(sum(category_totals.values()), 2)

    energy = category_totals["electricity"] + category_totals["natural_gas"]
    transport = (
        category_totals["petrol"]
        + category_totals["diesel"]
        + category_totals["air_travel"]
        + category_totals["commuting"]
    )
    waste = category_totals["waste"] + category_totals["hotels"]

    breakdown_pct = {}
    if total > 0:
        breakdown_pct = {
            "energy": round((energy / total) * 100),
            "transport": round((transport / total) * 100),
            "waste": round((waste / total) * 100),
        }

    return {
        "total_tco2e": total,
        "category_totals": category_totals,
        "breakdown_pct": breakdown_pct,
    }



# ---- Auth ----

class SignUpInput(BaseModel):
    email: str
    password: str

class SignInInput(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
def sign_up(data: SignUpInput):
    response = supabase.auth.sign_up({
        "email": data.email,
        "password": data.password,
    })
    return {
        "user": response.user,
        "session": response.session,
    }


@app.post("/auth/signin")
def sign_in(data: SignInInput):
    response = supabase.auth.sign_in_with_password({
        "email": data.email,
        "password": data.password,
    })
    return {
        "user": response.user,
        "session": response.session,
    }


# ---- Auth verification (for protecting endpoints) ----

from fastapi import Header, HTTPException

def get_current_user(authorization: str = Header(...)):
    """
    Expects header: Authorization: Bearer <access_token>
    Returns the authenticated user's info, or raises 401 if invalid.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user_response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# Example protected route to test it
from fastapi import Depends

@app.get("/me")
def get_my_profile(current_user = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
    }


# ---- Full assessment submission ----

class AssessmentInput(BaseModel):
    company_name: str
    industry: str = "general"
    employee_count: int | None = None
    location: str | None = None
    electricity: float = 0
    natural_gas: float = 0
    petrol: float = 0
    diesel: float = 0
    air_travel: float = 0
    hotels: float = 0
    commuting: float = 0
    waste: float = 0


@app.post("/assessment")
def submit_assessment(data: AssessmentInput, current_user = Depends(get_current_user)):
    user_id = current_user.id

    # 1. Create the company record
    company_response = supabase_admin.table("companies").insert({
        "user_id": user_id,
        "name": data.company_name,
        "industry": data.industry,
        "employee_count": data.employee_count,
        "location": data.location,
    }).execute()

    company = company_response.data[0]
    company_id = company["id"]

    # 2. Save each emission entry
    entry_categories = {
        "electricity": data.electricity,
        "natural_gas": data.natural_gas,
        "petrol": data.petrol,
        "diesel": data.diesel,
        "air_travel": data.air_travel,
        "hotels": data.hotels,
        "commuting": data.commuting,
        "waste": data.waste,
    }

    unit_map = {
        "electricity": "kWh", "natural_gas": "m3", "petrol": "L", "diesel": "L",
        "air_travel": "km", "hotels": "nights", "commuting": "km", "waste": "kg",
    }

    entries_to_insert = [
        {
            "company_id": company_id,
            "category": category,
            "value": value,
            "unit": unit_map[category],
        }
        for category, value in entry_categories.items()
    ]
    supabase_admin.table("emission_entries").insert(entries_to_insert).execute()

    # 3. Calculate footprint (reuse the same logic as /calculate)
    factors_response = (
        supabase.table("emission_factors").select("*").eq("industry", data.industry).execute()
    )
    factors = factors_response.data
    if not factors:
        factors_response = (
            supabase.table("emission_factors").select("*").eq("industry", "general").execute()
        )
        factors = factors_response.data

    factor_map = {f["category"]: f["factor_value"] for f in factors}
    category_totals = {
        cat: round(val * factor_map.get(cat, 0), 2) for cat, val in entry_categories.items()
    }
    total = round(sum(category_totals.values()), 2)

    energy = category_totals["electricity"] + category_totals["natural_gas"]
    transport = (
        category_totals["petrol"] + category_totals["diesel"]
        + category_totals["air_travel"] + category_totals["commuting"]
    )
    waste = category_totals["waste"] + category_totals["hotels"]

    breakdown_pct = {}
    if total > 0:
        breakdown_pct = {
            "energy": round((energy / total) * 100),
            "transport": round((transport / total) * 100),
            "waste": round((waste / total) * 100),
        }

    # 4. Save the result
    result_response = supabase_admin.table("results").insert({
        "company_id": company_id,
        "total_tco2e": total,
        "category_breakdown": breakdown_pct,
    }).execute()

    return {
        "company_id": company_id,
        "total_tco2e": total,
        "category_totals": category_totals,
        "breakdown_pct": breakdown_pct,
    }


@app.get("/results/{company_id}")
def get_results(company_id: str, current_user = Depends(get_current_user)):
    response = (
        supabase.table("results")
        .select("*")
        .eq("company_id", company_id)
        .order("calculated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="No results found for this company")
    return response.data[0]

# Round-1 /action-plan (Gemini) was replaced by the v2 Nugen agents: POST /v2/agents/{id}/chat and /v2/insights.
