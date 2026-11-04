"""
Round-1 compatible AI action plan, now routed through the Nugen aligned model
(via llm_provider) instead of Gemini.
"""

import asyncio

from llm_provider import chat


def build_action_plan_prompt(company_name: str, industry: str, scope1: float, scope2: float, scope3: float) -> str:
    return f"""Analyze this company's carbon emissions and create a practical, industry-specific carbon reduction action plan.

Company: {company_name}
Industry: {industry}
Scope 1 emissions: {scope1:.2f} tCO2e
Scope 2 emissions: {scope2:.2f} tCO2e
Scope 3 emissions: {scope3:.2f} tCO2e

Provide: 1) key emission areas, 2) specific reduction actions, 3) priority of each, 4) expected impact,
5) short-term actions, 6) long-term actions. For every action add a one-line justification that cites the numbers above."""


def generate_ai_response(prompt: str) -> str:
    offline = ("Focus first on the largest scope. Scope 2: efficiency then renewable procurement. "
               "Scope 1: fleet electrification and fuel switching. Scope 3: travel policy, commuting and waste segregation.")
    result = asyncio.run(chat(
        [{"role": "system", "content": "You are CarbonAI, an AI sustainability advisor for Indian businesses. Only use the numbers you are given."},
         {"role": "user", "content": prompt}],
        offline_text=offline,
    ))
    return result.text


def generate_action_plan(company_name: str, industry: str, scope1: float, scope2: float, scope3: float) -> str:
    return generate_ai_response(build_action_plan_prompt(company_name, industry, scope1, scope2, scope3))
