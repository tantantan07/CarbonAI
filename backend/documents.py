"""
CarbonAI — Document agent ("Archivist").

Upload any mix of PDFs, Excel/CSV sheets, Word files or text. The agent:
  1. extracts text/table content,
  2. segregates each document into an emission category
     (electricity bill, fuel invoice, gas bill, travel, hotel, commuting,
      waste manifest, company profile, other),
  3. pulls out activity quantities with the evidence line they came from,
  4. aggregates everything into suggested assessment inputs.

CarbonAI's own Excel template (GET /v2/documents/template) is parsed exactly.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from xml.etree import ElementTree

from emission_engine import CATEGORIES, DEFAULT_FACTORS

DOC_TYPES = {
    "electricity_bill": {"label": "Electricity bill", "category": "electricity",
                         "keywords": ["kwh", "electricity", "msedcl", "mseb", "tata power", "adani electricity", "bescom", "energy charges", "units consumed", "meter reading", "kvah", "discom", "power bill", "electricity bill", "sanctioned load"]},
    "fuel_invoice": {"label": "Fuel invoice", "category": "diesel",
                     "keywords": ["diesel", "petrol", "hsd", "fuel", "litre", "liters", "litres", "indian oil", "bpcl", "hpcl", "fleet card", "dg set", "pump"]},
    "gas_bill": {"label": "Gas bill", "category": "natural_gas",
                 "keywords": ["png", "natural gas", "scm", "mngl", "igl", "mahanagar gas", "gail", "m3", "cubic"]},
    "travel": {"label": "Business travel record", "category": "air_travel",
               "keywords": ["flight", "airline", "pnr", "boarding", "indigo", "air india", "vistara", "akasa", "sector", "itinerary", "air travel"]},
    "hotel": {"label": "Hotel invoice", "category": "hotels",
              "keywords": ["hotel", "room night", "check-in", "check in", "checkout", "stay", "accommodation", "room nights"]},
    "commuting": {"label": "Commuting survey", "category": "commuting",
                  "keywords": ["commute", "commuting", "employee travel", "shuttle", "cab", "survey", "distance to office"]},
    "waste": {"label": "Waste manifest", "category": "waste",
              "keywords": ["waste", "landfill", "manifest", "recycl", "scrap", "e-waste", "disposal", "garbage", "msw"]},
    "company_profile": {"label": "Company profile", "category": None,
                        "keywords": ["employees", "headcount", "turnover", "revenue", "cin", "registered office", "about us", "industry"]},
}

UNIT_PATTERNS = {
    "electricity": r"(\d[\d,]*\.?\d*)\s*(?:kwh|kw\s?h|units?\b)",
    "petrol": r"petrol[^\d\n]{0,40}(\d[\d,]*\.?\d*)\s*(?:l\b|ltr|litres?|liters?)",
    "diesel": r"(?:diesel|hsd)[^\d\n]{0,40}(\d[\d,]*\.?\d*)\s*(?:l\b|ltr|litres?|liters?)",
    "natural_gas": r"(\d[\d,]*\.?\d*)\s*(?:scm|m3|m³|cubic\s*met)",
    "air_travel": r"(\d[\d,]*\.?\d*)\s*(?:km|kms|kilomet)[^\n]{0,30}(?:flight|air)|(?:flight|air)[^\d\n]{0,40}(\d[\d,]*\.?\d*)\s*(?:km|kms)",
    "hotels": r"(\d[\d,]*\.?\d*)\s*(?:room[\s-]?nights?|nights?)",
    "commuting": r"(?:commut)[^\d\n]{0,40}(\d[\d,]*\.?\d*)\s*(?:km|kms)",
    "waste": r"(\d[\d,]*\.?\d*)\s*(kg|kgs|tonnes?|tons?|mt)\b",
}

TEMPLATE_KEYS = {
    "electricity (kwh)": "electricity", "natural gas (m3)": "natural_gas", "petrol (litres)": "petrol",
    "diesel (litres)": "diesel", "air travel (passenger-km)": "air_travel", "hotels (room-nights)": "hotels",
    "employee commuting (passenger-km)": "commuting", "waste to landfill (kg)": "waste",
}
PROFILE_KEYS = {"company name": "name", "industry": "industry", "employees": "employees",
                "location": "location", "annual revenue (inr crore)": "revenue_cr",
                "renewable electricity share (%)": "renewable_share", "reporting period": "period"}


# ---------------------------------------------------------------- extraction
def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages[:30])


def _xlsx_rows(data: bytes) -> list[list]:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    rows = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            if any(c not in (None, "") for c in row):
                rows.append([c for c in row])
    return rows


def _docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    return "\n".join("".join(t.text or "" for t in p.iter(f"{ns}t")) for p in root.iter(f"{ns}p"))


def extract(filename: str, data: bytes) -> tuple[str, list[list]]:
    name = filename.lower()
    rows: list[list] = []
    if name.endswith(".pdf"):
        text = _pdf_text(data)
    elif name.endswith((".xlsx", ".xlsm")):
        rows = _xlsx_rows(data)
        text = "\n".join(" | ".join("" if c is None else str(c) for c in r) for r in rows)
    elif name.endswith(".csv"):
        decoded = data.decode("utf-8", errors="ignore")
        rows = [r for r in csv.reader(io.StringIO(decoded))]
        text = "\n".join(" | ".join(r) for r in rows)
    elif name.endswith(".docx"):
        text = _docx_text(data)
    else:
        text = data.decode("utf-8", errors="ignore")
    return text, rows


def _num(s) -> float | None:
    try:
        return float(str(s).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- template
def parse_template(rows: list[list]) -> tuple[dict, dict] | None:
    values, profile = {}, {}
    for r in rows:
        if len(r) < 2 or r[0] is None:
            continue
        key = str(r[0]).strip().lower()
        if key in TEMPLATE_KEYS:
            n = _num(r[1])
            if n is not None:
                values[TEMPLATE_KEYS[key]] = n
        elif key in PROFILE_KEYS and r[1] not in (None, ""):
            profile[PROFILE_KEYS[key]] = r[1]
    return (values, profile) if values else None


# ---------------------------------------------------------------- classify
def classify(filename: str, text: str) -> dict:
    hay = f"{filename} {text}".lower()
    scores = {}
    for dtype, spec in DOC_TYPES.items():
        scores[dtype] = sum(hay.count(k) for k in spec["keywords"])
    best = max(scores, key=scores.get)
    total = sum(scores.values())
    if scores[best] == 0:
        return {"type": "other", "label": "Unclassified", "confidence": 0.0, "matched": []}
    matched = [k for k in DOC_TYPES[best]["keywords"] if k in hay][:6]
    ranked = sorted((v, k) for k, v in scores.items() if v > 0)[::-1]
    also = [DOC_TYPES[k]["label"] for v, k in ranked[1:3] if v >= 0.5 * scores[best]]
    label = DOC_TYPES[best]["label"] + (f" + {', '.join(also)}" if also else "")
    return {"type": best if not also else "mixed", "primary_type": best, "label": label if not also else f"Mixed records ({label})",
            "confidence": round(scores[best] / total, 2), "matched": matched, "secondary": also}


def extract_quantities(text: str, doc_type: str) -> dict:
    found = {}
    lines = text.splitlines() or [text]
    for cat, pattern in UNIT_PATTERNS.items():
        hits = []
        for line in lines:
            for m in re.finditer(pattern, line, flags=re.IGNORECASE):
                raw = next((g for g in m.groups() if g and re.match(r"\d", g)), None)
                n = _num(raw)
                if n is None or n <= 0:
                    continue
                if cat == "waste":
                    unit = (m.group(2) or "kg").lower()
                    if unit.startswith(("t", "mt")):
                        n *= 1000
                hits.append({"value": n, "evidence": line.strip()[:160]})
        if hits:
            # electricity bills often show many numbers in kWh; the largest "units consumed"-like is usually total
            pick = max(hits, key=lambda h: h["value"]) if cat == "electricity" else hits[0]
            found[cat] = {"value": pick["value"], "evidence": pick["evidence"], "candidates": len(hits)}

    primary = DOC_TYPES.get(doc_type, {}).get("category")
    for k, v in found.items():
        v["primary"] = (k == primary) or (doc_type == "fuel_invoice" and k in ("petrol", "diesel"))
    return found


def process(files: list[tuple[str, bytes]]) -> dict:
    docs = []
    suggested = {c: 0.0 for c in CATEGORIES}
    profile_hint: dict = {}
    for filename, data in files:
        try:
            text, rows = extract(filename, data)
        except Exception as exc:  # noqa: BLE001 — report per-file failure, keep going
            docs.append({"filename": filename, "type": "error", "label": "Could not read", "error": str(exc)})
            continue

        tpl = parse_template(rows) if rows else None
        if tpl:
            values, prof = tpl
            for k, v in values.items():
                suggested[k] += v
            profile_hint.update({k: v for k, v in prof.items() if v not in (None, "")})
            docs.append({
                "filename": filename, "type": "carbonai_template", "label": "CarbonAI data template",
                "confidence": 1.0, "matched": ["template headers"],
                "extracted": {k: {"value": v, "evidence": "CarbonAI template row"} for k, v in values.items()},
                "chars": len(text), "preview": text[:300],
            })
            continue

        cls = classify(filename, text)
        qty = extract_quantities(text, cls.get("primary_type", cls["type"]))
        for k, v in qty.items():
            suggested[k] += v["value"]
        docs.append({**cls, "filename": filename, "extracted": qty, "chars": len(text), "preview": text[:300]})

    groups: dict[str, list[str]] = {}
    for d in docs:
        groups.setdefault(d.get("label", "Other"), []).append(d["filename"])

    return {
        "documents": docs,
        "groups": groups,
        "suggested_inputs": {k: round(v, 2) for k, v in suggested.items() if v > 0},
        "profile_hint": profile_hint,
        "justification": (
            "Each file is scored against keyword dictionaries per document type (e.g. 'kWh', 'MSEDCL', 'units consumed' → electricity bill). "
            "Quantities are read with unit-aware patterns and every value keeps the source line as evidence. "
            "CarbonAI template sheets are read cell-by-cell. Review values before applying them."
        ),
        "units": {c: DEFAULT_FACTORS[c].unit for c in CATEGORIES},
    }


def summary_for_llm(result: dict) -> str:
    out = []
    for d in result["documents"]:
        ex = ", ".join(f"{k}={v['value']:,.0f}" for k, v in (d.get("extracted") or {}).items())
        out.append(f"- {d['filename']}: {d.get('label')} (confidence {d.get('confidence', 0)}); extracted: {ex or 'nothing'}")
    out.append("Suggested annual inputs: " + ", ".join(f"{k}={v:,.0f}" for k, v in result["suggested_inputs"].items()))
    return "\n".join(out)
