import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

# Use stable, production-ready Gemini models. The fallback helps when a model
# is temporarily at capacity; Google recommends retry/backoff for 503 errors.
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def generate_ai_response(prompt: str) -> str:
    """Generate a text response, falling back if Gemini is temporarily unavailable."""
    try:
        response = gemini_client.models.generate_content(
            model=PRIMARY_MODEL,
            contents=prompt,
        )
        if response.text:
            return response.text.strip()
    except Exception as primary_error:
        print(f"Primary Gemini model failed: {primary_error}")

    response = gemini_client.models.generate_content(
        model=FALLBACK_MODEL,
        contents=prompt,
    )

    if not response.text:
        raise RuntimeError("Gemini returned an empty recommendation.")

    return response.text.strip()


def build_action_plan_prompt(
    company_name: str,
    industry: str,
    scope1: float,
    scope2: float,
    scope3: float,
) -> str:
    return f"""
You are CarbonAI, an AI sustainability advisor.

Analyze this company's carbon emissions and create a practical,
industry-specific carbon reduction action plan.

Company: {company_name}
Industry: {industry}

Scope 1 emissions: {scope1} tCO2e
Scope 2 emissions: {scope2} tCO2e
Scope 3 emissions: {scope3} tCO2e

Provide:
1. Key emission areas to address
2. Specific reduction actions
3. Priority of each action
4. Expected environmental impact
5. Short-term actions
6. Long-term actions

Keep the recommendations practical, measurable, and relevant to
the company's industry and reported emissions.
"""


def generate_action_plan(
    company_name: str,
    industry: str,
    scope1: float,
    scope2: float,
    scope3: float,
) -> str:
    prompt = build_action_plan_prompt(
        company_name=company_name,
        industry=industry,
        scope1=scope1,
        scope2=scope2,
        scope3=scope3,
    )
    return generate_ai_response(prompt)
