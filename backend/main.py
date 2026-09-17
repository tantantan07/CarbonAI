import os
from fastapi import FastAPI
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from ai_service import generate_action_plan

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
app = FastAPI(title="CarbonAI Backend")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://carbon-ai-ten.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "CarbonAI backend is running!"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

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


def get_factor_map(industry: str):
    response = (
        supabase.table("emission_factors")
        .select("*")
        .eq("industry", industry)
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

    return {f["category"]: f["factor_value"] for f in factors}


def calculate_category_totals(inputs: dict, factor_map: dict):
    return {
        category: round(value * factor_map.get(category, 0), 2)
        for category, value in inputs.items()
    }


def build_breakdown(category_totals: dict):
    energy = category_totals["electricity"] + category_totals["natural_gas"]
    travel = (
        category_totals["petrol"]
        + category_totals["diesel"]
        + category_totals["air_travel"]
        + category_totals["hotels"]
        + category_totals["commuting"]
    )
    waste = category_totals["waste"]
    total_kgco2e = round(energy + travel + waste, 2)

    breakdown_pct = {}
    if total_kgco2e > 0:
        breakdown_pct = {
            "energy": round((energy / total_kgco2e) * 100),
            "transport": round((travel / total_kgco2e) * 100),
            "waste": round((waste / total_kgco2e) * 100),
        }

    return {
        "energy_kg": round(energy, 2),
        "travel_kg": round(travel, 2),
        "waste_kg": round(waste, 2),
        "breakdown_pct": breakdown_pct,
        "total_kgco2e": total_kgco2e,
    }


@app.post("/calculate")
def calculate_footprint(data: EmissionInput):
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

    factor_map = get_factor_map(data.industry)
    category_totals = calculate_category_totals(inputs, factor_map)
    breakdown = build_breakdown(category_totals)

    return {
        "total_kgco2e": breakdown["total_kgco2e"],
        "total_tco2e": round(breakdown["total_kgco2e"] / 1000, 4),
        "category_totals": category_totals,
        "breakdown_pct": breakdown["breakdown_pct"],
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

    # 3. Calculate footprint using the same factor source as /calculate
    factor_map = get_factor_map(data.industry)
    category_totals = calculate_category_totals(entry_categories, factor_map)
    breakdown = build_breakdown(category_totals)

    total_kgco2e = breakdown["total_kgco2e"]
    total_tco2e = round(total_kgco2e / 1000, 4)

    # 4. Save the result
    result_response = supabase_admin.table("results").insert({
        "company_id": company_id,
        "total_tco2e": total_tco2e,
        "category_breakdown": breakdown["breakdown_pct"],
    }).execute()

    return {
        "company_id": company_id,
        "company_name": company["name"],
        "industry": company["industry"],
        "total_kgco2e": total_kgco2e,
        "total_tco2e": total_tco2e,
        "category_totals": category_totals,
        "breakdown_pct": breakdown["breakdown_pct"],
    }


# ---- Dashboard: latest result for the authenticated user ----

@app.get("/results")
def get_dashboard_results(current_user = Depends(get_current_user)):
    company_response = (
        supabase_admin.table("companies")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not company_response.data:
        raise HTTPException(status_code=404, detail="No company assessment found")

    company = company_response.data[0]
    company_id = company["id"]

    result_response = (
        supabase_admin.table("results")
        .select("*")
        .eq("company_id", company_id)
        .order("calculated_at", desc=True)
        .limit(1)
        .execute()
    )

    if not result_response.data:
        raise HTTPException(status_code=404, detail="No results found for this company")

    entries_response = (
        supabase_admin.table("emission_entries")
        .select("*")
        .eq("company_id", company_id)
        .execute()
    )

    factor_map = get_factor_map(company.get("industry") or "general")
    category_totals = {}
    for entry in entries_response.data:
        category = entry["category"]
        value = float(entry["value"])
        category_totals[category] = round(
            category_totals.get(category, 0) + value * factor_map.get(category, 0),
            2,
        )

    breakdown = build_breakdown({
        "electricity": category_totals.get("electricity", 0),
        "natural_gas": category_totals.get("natural_gas", 0),
        "petrol": category_totals.get("petrol", 0),
        "diesel": category_totals.get("diesel", 0),
        "air_travel": category_totals.get("air_travel", 0),
        "hotels": category_totals.get("hotels", 0),
        "commuting": category_totals.get("commuting", 0),
        "waste": category_totals.get("waste", 0),
    })

    result = result_response.data[0]
    return {
        "company_id": company_id,
        "company_name": company["name"],
        "industry": company["industry"],
        "location": company.get("location"),
        "employee_count": company.get("employee_count"),
        "total_kgco2e": breakdown["total_kgco2e"],
        "total_tco2e": float(result["total_tco2e"]),
        "category_totals": category_totals,
        "breakdown": {
            "energy_kg": breakdown["energy_kg"],
            "travel_kg": breakdown["travel_kg"],
            "waste_kg": breakdown["waste_kg"],
        },
        "breakdown_pct": breakdown["breakdown_pct"],
        "calculated_at": result["calculated_at"],
    }


@app.get("/results/{company_id}")
def get_results(company_id: str, current_user = Depends(get_current_user)):
    company_response = (
        supabase_admin.table("companies")
        .select("id")
        .eq("id", company_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not company_response.data:
        raise HTTPException(status_code=404, detail="Company not found")

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


# ---- AI Action Plan ----

@app.get("/action-plan")
def get_action_plan(current_user=Depends(get_current_user)):
    user_id = current_user.id

    company_response = (
        supabase_admin.table("companies")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not company_response.data:
        raise HTTPException(
            status_code=404,
            detail="No company assessment found"
        )

    company = company_response.data[0]
    company_id = company["id"]

    entries_response = (
        supabase_admin.table("emission_entries")
        .select("*")
        .eq("company_id", company_id)
        .execute()
    )

    entries = entries_response.data
    factor_map = get_factor_map(company.get("industry") or "general")

    scope1_categories = {"natural_gas", "petrol", "diesel"}
    scope2_categories = {"electricity"}

    scope1 = 0
    scope2 = 0
    scope3 = 0

    for entry in entries:
        category = entry["category"]
        value = float(entry["value"])
        emissions_kgco2e = value * factor_map.get(category, 0)

        if category in scope1_categories:
            scope1 += emissions_kgco2e
        elif category in scope2_categories:
            scope2 += emissions_kgco2e
        else:
            scope3 += emissions_kgco2e

    scope1_tco2e = round(scope1 / 1000, 4)
    scope2_tco2e = round(scope2 / 1000, 4)
    scope3_tco2e = round(scope3 / 1000, 4)

    action_plan = generate_action_plan(
        company_name=company["name"],
        industry=company["industry"],
        scope1=scope1_tco2e,
        scope2=scope2_tco2e,
        scope3=scope3_tco2e,
    )

    return {
        "company_id": company_id,
        "company_name": company["name"],
        "industry": company["industry"],
        "scope1": scope1_tco2e,
        "scope2": scope2_tco2e,
        "scope3": scope3_tco2e,
        "action_plan": action_plan,
    }
