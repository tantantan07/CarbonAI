"""
CarbonAI — report generation (PDF + Excel), two audiences:

  ceo          -> "Executive Carbon Brief": decisions, ₹, payback, risk, readiness
  stakeholder  -> "Carbon Disclosure Statement": methodology, factors, uncertainty,
                  data quality and a justification for every figure

Plus the Excel data-entry template the Document agent can read back.
"""

from __future__ import annotations

import io
from datetime import date

from emission_engine import CATEGORIES, DEFAULT_FACTORS

GREEN = "0B3D2C"
MINT = "91E5AA"


def _ascii(text) -> str:
    """Helvetica in reportlab is Latin-1 only — normalise symbols."""
    s = str(text)
    for a, b in {"₹": "Rs ", "CO₂": "CO2", "≈": "~", "≤": "<=", "≥": ">=", "−": "-", "σ": "sigma",
                 "Σ": "sum", "→": "->", "—": "-", "–": "-", "’": "'", "“": '"', "”": '"', "…": "...",
                 "₂": "2", "m³": "m3", "**": ""}.items():
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


def _inr(v) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "-"
    if abs(v) >= 1e7:
        return f"Rs {v/1e7:,.2f} Cr"
    if abs(v) >= 1e5:
        return f"Rs {v/1e5:,.2f} L"
    return f"Rs {v:,.0f}"


# =================================================================== PDF
def build_pdf(profile: dict, analysis: dict, audience: str = "ceo", scenarios: dict | None = None,
              narrative: str | None = None, mac: list | None = None) -> bytes:
    from reportlab.graphics.charts.barcharts import HorizontalBarChart
    from reportlab.graphics.charts.lineplots import LinePlot
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing, String
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="CarbonAI report", author="CarbonAI")
    ss = getSampleStyleSheet()
    deep = colors.HexColor("#" + GREEN)
    mint = colors.HexColor("#" + MINT)
    H1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=deep, alignment=0, spaceAfter=4)
    H2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=deep, spaceBefore=10, spaceAfter=4)
    P = ParagraphStyle("p", parent=ss["BodyText"], fontSize=9.5, leading=13)
    SMALL = ParagraphStyle("s", parent=P, fontSize=8, leading=10.5, textColor=colors.HexColor("#555555"))

    def para(t, st=P):
        return Paragraph(_ascii(t), st)

    def table(rows, widths=None, header=True):
        CELL = ParagraphStyle("cell", parent=SMALL, fontSize=8, leading=10, textColor=colors.black)
        tb = Table([[(_ascii(c) if i == 0 else para(c, CELL)) for c in r] for i, r in enumerate(rows)],
                   colWidths=widths, repeatRows=1 if header else 0)
        style = [("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
                 ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
                 ("VALIGN", (0, 0), (-1, -1), "TOP"),
                 ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3faf5")])]
        if header:
            style += [("BACKGROUND", (0, 0), (-1, 0), deep), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                      ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5)]
        tb.setStyle(TableStyle(style))
        return tb

    s = analysis["scope_totals"]
    total = analysis["total_tco2e"]
    company = profile.get("name") or "Company"
    title = "Executive Carbon Brief" if audience == "ceo" else "Carbon Disclosure Statement"
    story = [
        para(f"CarbonAI  |  {'For the CEO & board' if audience == 'ceo' else 'For investors, auditors & partners'}", SMALL),
        Paragraph(_ascii(f"{title} - {company}"), H1),
        para(f"{profile.get('industry') or analysis.get('industry')}  |  {profile.get('location') or 'India'}  |  "
             f"{profile.get('employees') or '-'} employees  |  Generated {date.today():%d %b %Y}", SMALL),
        Spacer(1, 8),
    ]

    kpi = [["Total footprint", "Scope 1", "Scope 2", "Scope 3", "Readiness"],
           [f"{total:,.2f} tCO2e", f"{s['scope1']:,.2f} t", f"{s['scope2']:,.2f} t", f"{s['scope3']:,.2f} t",
            f"{analysis['readiness']['score']}/100"]]
    kt = Table(kpi, colWidths=[36 * mm] * 5)
    kt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), mint), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
                            ("FONT", (0, 1), (-1, 1), "Helvetica-Bold", 12), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("BOX", (0, 0), (-1, -1), 0.5, deep), ("TOPPADDING", (0, 1), (-1, 1), 8), ("BOTTOMPADDING", (0, 1), (-1, 1), 8)]))
    story += [kt, Spacer(1, 8)]

    if narrative:
        story += [Paragraph("AI summary" if audience == "ceo" else "Analyst statement", H2)]
        for chunk in [c for c in narrative.split("\n") if c.strip()]:
            story.append(para(chunk.strip().lstrip("#").strip()))

    story.append(Paragraph("What it means", H2))
    for imp in analysis.get("impacts", []):
        story.append(para(f"- {imp}"))

    # charts: pie by scope + forecast line
    d = Drawing(480, 170)
    pie = Pie()
    pie.x, pie.y, pie.width, pie.height = 10, 15, 130, 130
    vals = [max(s["scope1"], 0.0001), max(s["scope2"], 0.0001), max(s["scope3"], 0.0001)]
    pie.data = vals
    pie.labels = [f"S1 {s['scope1']/total*100 if total else 0:.0f}%", f"S2 {s['scope2']/total*100 if total else 0:.0f}%", f"S3 {s['scope3']/total*100 if total else 0:.0f}%"]
    for i, c in enumerate(["#ff9b6b", "#ffd166", "#7cc6fe"]):
        pie.slices[i].fillColor = colors.HexColor(c)
    d.add(pie)
    bau = analysis.get("forecast_bau", [])
    if bau:
        lp = LinePlot()
        lp.x, lp.y, lp.width, lp.height = 210, 25, 250, 120
        lp.data = [[(i, r["total"]) for i, r in enumerate(bau)],
                   [(i, analysis["target"]["base_year_total"] * (1 - 0.042) ** i) for i in range(len(bau))]]
        lp.lines[0].strokeColor = deep
        lp.lines[0].strokeWidth = 2
        lp.lines[1].strokeColor = colors.HexColor("#2fbf71")
        lp.lines[1].strokeDashArray = [3, 2]
        lp.xValueAxis.valueSteps = list(range(len(bau)))
        lp.xValueAxis.labelTextFormat = lambda v: bau[int(v)]["period"] if int(v) < len(bau) else ""
        lp.xValueAxis.labels.fontSize = 7
        lp.yValueAxis.labels.fontSize = 7
        lp.yValueAxis.valueMin = 0
        d.add(lp)
        d.add(String(210, 155, "Business-as-usual (solid) vs 1.5C pathway (dashed), tCO2e", fontSize=8, fillColor=deep))
    story += [Paragraph("Footprint & trajectory", H2), d]

    rows = [["Source", "Scope", "tCO2e", "Share", "10% cut saves"]]
    for dv in analysis.get("drivers", []):
        rows.append([dv["label"], str(dv["scope"]), f"{dv['tco2e']:,.2f}", f"{dv['share']}%", _inr(dv["cut10_saving_inr"])])
    story += [Paragraph("Emission sources", H2), table(rows, [60 * mm, 15 * mm, 25 * mm, 20 * mm, 40 * mm])]

    mac = mac or []
    if mac:
        story.append(Paragraph("Climate-tech switches (cheapest per tonne first)", H2))
        rows = [["Technology", "Scope", "tCO2e/yr", "Capex", "Saving/yr", "Payback", "Rs/tCO2e"]]
        for m in mac[:8]:
            rows.append([m["name"], str(m["scope"]), f"{m['abatement_tco2e']:,.2f}", _inr(m["capex_inr"]), _inr(m["annual_saving_inr"]),
                         f"{m['payback_years']} y" if m["payback_years"] else "-", f"{m['mac_inr_per_tco2e']:,}" if m["mac_inr_per_tco2e"] is not None else "-"])
        story.append(table(rows, [56 * mm, 12 * mm, 20 * mm, 22 * mm, 22 * mm, 16 * mm, 20 * mm]))
        if audience == "ceo":
            hb = Drawing(480, 20 + 16 * min(len(mac), 8))
            bc = HorizontalBarChart()
            bc.x, bc.y, bc.width, bc.height = 150, 10, 300, 14 * min(len(mac), 8)
            bc.data = [[m["abatement_tco2e"] for m in mac[:8]]]
            bc.categoryAxis.categoryNames = [_ascii(m["name"][:34]) for m in mac[:8]]
            bc.categoryAxis.labels.fontSize = 6.5
            bc.valueAxis.labels.fontSize = 6.5
            bc.bars[0].fillColor = mint
            bc.valueAxis.valueMin = 0
            hb.add(bc)
            story.append(hb)

    if scenarios and scenarios.get("scenarios"):
        story.append(Paragraph("Scenario comparison", H2))
        rows = [["Scenario", "Scope", "Horizon", "End vs BAU", "Cumulative t avoided", "Capex", "Payback", "1.5C?", "Score"]]
        for sc in scenarios["scenarios"]:
            rows.append([sc["name"], str(sc["scope"]), f"{sc['horizon_years']} y", f"-{sc['reduction_vs_bau_pct']}%",
                         f"{sc['cumulative_abatement_tco2e']:,.1f}", _inr(sc["capex_inr"]),
                         f"{sc['payback_years']} y" if sc["payback_years"] else "-", "Yes" if sc["meets_1p5_target"] else "No", str(sc.get("score", "-"))])
        story += [table(rows), para(f"Recommended: {scenarios.get('recommended')}. {scenarios.get('justification', '')}", SMALL)]

    if audience == "ceo":
        story.append(Paragraph("Risk & compliance watch-list", H2))
        for line in [
            "SEBI BRSR Core: Scope 1 & 2 disclosure and assurance applies to the top listed companies and is cascading to their value chains.",
            "Carbon Credit Trading Scheme (CCTS): intensity targets for notified sectors create a price on excess emissions.",
            "EU CBAM: exporters of steel, aluminium, cement, fertiliser and hydrogen to the EU must report embedded emissions.",
            f"Peer position: {analysis['benchmark']['verdict'] if analysis.get('benchmark') else 'add headcount to benchmark against peers'}.",
        ]:
            story.append(para(f"- {line}"))
    else:
        story += [PageBreak(), Paragraph("Methodology & justification", H2),
                  para("Organisational boundary: operational control. Standard: GHG Protocol Corporate Accounting & Reporting Standard; "
                       "Scope 2 location-based. Formula: tCO2e = sum(annual activity x emission factor).")]
        rows = [["Category", "Scope", "Activity", "Factor (tCO2e/unit)", "Source"]]
        for c in CATEGORIES:
            f = analysis["factors_used"][c]
            rows.append([f["label"], str(f["scope"]), f"{analysis['activity'][c]:,.0f} {f['unit']}", f"{f['value']}", f["source"]])
        story.append(table(rows, [38 * mm, 12 * mm, 32 * mm, 26 * mm, 66 * mm]))
        u = analysis["uncertainty"]
        story += [Paragraph("Uncertainty", H2), para(f"80% confidence interval: {u['p10']:,.2f} - {u['p90']:,.2f} tCO2e (median {u['p50']:,.2f}). {u['justification']}")]
        if analysis.get("benchmark"):
            story += [Paragraph("Benchmark", H2), para(analysis["benchmark"]["justification"])]
        story += [Paragraph("Target alignment", H2), para(analysis["target"]["justification"])]
        story.append(Paragraph("Data-quality flags", H2))
        flags = analysis.get("anomalies") or []
        if not flags:
            story.append(para("No data-quality issues detected."))
        for a in flags:
            story.append(para(f"- [{a['severity']}] {a['message']}"))
        story += [Paragraph("Readiness score", H2), para(analysis["readiness"]["justification"] + " Components: " +
                  ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in analysis["readiness"]["components"].items()))]

    story += [Spacer(1, 10), para("Generated by CarbonAI. AI narrative produced via the configured inference provider (Nugen aligned model in production). "
                                  "Figures are estimates based on user-supplied activity data and should be verified before external assurance.", SMALL)]
    doc.build(story)
    return buf.getvalue()


# =================================================================== XLSX
def build_xlsx(profile: dict, analysis: dict, audience: str = "ceo", scenarios: dict | None = None,
               narrative: str | None = None, mac: list | None = None) -> bytes:
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, LineChart, PieChart, Reference
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    head = PatternFill("solid", fgColor=GREEN)
    hfont = Font(color="FFFFFF", bold=True)

    def sheet(title, rows, widths=None):
        ws = wb.create_sheet(title)
        for r in rows:
            ws.append(r)
        for c in ws[1]:
            c.fill, c.font = head, hfont
        for i, w in enumerate(widths or [], start=1):
            ws.column_dimensions[chr(64 + i)].width = w
        for row in ws.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical="top")
        return ws

    ws = wb.active
    ws.title = "Summary"
    ws.append([f"CarbonAI — {'Executive Carbon Brief' if audience == 'ceo' else 'Carbon Disclosure Statement'}"])
    ws["A1"].font = Font(size=16, bold=True, color=GREEN)
    ws.append([f"Generated {date.today():%d %b %Y}"])
    ws.append([])
    for k in ("name", "industry", "location", "employees", "revenue_cr", "renewable_share", "goals", "period"):
        if profile.get(k) not in (None, ""):
            ws.append([k.replace("_", " ").title(), str(profile[k])])
    ws.append([])
    s = analysis["scope_totals"]
    for label, val in [("Total (tCO2e)", analysis["total_tco2e"]), ("Scope 1", s["scope1"]), ("Scope 2", s["scope2"]), ("Scope 3", s["scope3"]),
                       ("Readiness score", analysis["readiness"]["score"]), ("P10", analysis["uncertainty"]["p10"]), ("P90", analysis["uncertainty"]["p90"])]:
        ws.append([label, val])
    ws.append([])
    ws.append(["Key impacts"])
    ws.cell(ws.max_row, 1).font = Font(bold=True)
    for imp in analysis.get("impacts", []):
        ws.append([imp])
    if narrative:
        ws.append([])
        ws.append(["AI narrative"])
        ws.cell(ws.max_row, 1).font = Font(bold=True)
        for line in narrative.split("\n"):
            if line.strip():
                ws.append([line.replace("**", "")])
    ws.column_dimensions["A"].width = 32
    ws.column_dimensions["B"].width = 60

    rows = [["Category", "Scope", "Activity", "Unit", "Factor (tCO2e/unit)", "tCO2e", "Share %", "Source / justification"]]
    for c in CATEGORIES:
        f = analysis["factors_used"][c]
        rows.append([f["label"], f["scope"], analysis["activity"][c], f["unit"], f["value"], analysis["category_totals"][c], analysis["shares"][c], f["source"]])
    em = sheet("Emissions", rows, [30, 8, 14, 14, 18, 12, 10, 60])
    pie = PieChart()
    pie.title = "Emissions by category"
    pie.add_data(Reference(em, min_col=6, min_row=1, max_row=len(rows)), titles_from_data=True)
    pie.set_categories(Reference(em, min_col=1, min_row=2, max_row=len(rows)))
    em.add_chart(pie, "J2")

    fr = [["Period", "Scope 1", "Scope 2", "Scope 3", "Total (BAU)", "Low (P10)", "High (P90)"]]
    for r in analysis.get("forecast_bau", []):
        fr.append([r["period"], r["scope1"], r["scope2"], r["scope3"], r["total"], r["low"], r["high"]])
    fs = sheet("Forecast", fr, [12, 12, 12, 12, 14, 12, 12])
    lc = LineChart()
    lc.title = "Business-as-usual forecast (tCO2e)"
    lc.add_data(Reference(fs, min_col=5, min_row=1, max_row=len(fr), max_col=7), titles_from_data=True)
    lc.set_categories(Reference(fs, min_col=1, min_row=2, max_row=len(fr)))
    fs.add_chart(lc, "I2")

    if mac:
        mr = [["Technology", "Scope", "Abatement tCO2e/yr", "Capex INR", "Annual saving INR", "Payback yrs", "MAC INR/tCO2e", "Plain-language", "Justification"]]
        for m in mac:
            mr.append([m["name"], m["scope"], m["abatement_tco2e"], m["capex_inr"], m["annual_saving_inr"], m["payback_years"], m["mac_inr_per_tco2e"], m["simple"], m["justification"]])
        ms = sheet("Climate tech", mr, [36, 8, 16, 14, 16, 12, 14, 40, 70])
        bc = BarChart()
        bc.type = "bar"
        bc.title = "Abatement potential by technology"
        bc.add_data(Reference(ms, min_col=3, min_row=1, max_row=len(mr)), titles_from_data=True)
        bc.set_categories(Reference(ms, min_col=1, min_row=2, max_row=len(mr)))
        ms.add_chart(bc, "K2")

    if scenarios and scenarios.get("scenarios"):
        sr = [["Scenario", "Scope", "Resolution", "Horizon", "End baseline", "End scenario", "Reduction vs BAU %", "Cumulative avoided t", "Capex INR", "Payback", "Meets 1.5C", "Score", "Justification"]]
        for sc in scenarios["scenarios"]:
            sr.append([sc["name"], sc["scope"], sc["resolution"], sc["horizon_years"], sc["end_baseline"], sc["end_scenario"], sc["reduction_vs_bau_pct"],
                       sc["cumulative_abatement_tco2e"], sc["capex_inr"], sc["payback_years"], "Yes" if sc["meets_1p5_target"] else "No", sc.get("score"), sc["justification"]])
        sheet("Scenarios", sr, [24, 8, 12, 9, 13, 13, 14, 16, 14, 10, 10, 8, 70])
        for sc in scenarios["scenarios"]:
            rows = [["Period", "Baseline", "Scenario", "Scope 1", "Scope 2", "Scope 3"]] + [
                [p["period"], p["baseline"], p["scenario"], p["scope1"], p["scope2"], p["scope3"]] for p in sc["series"]]
            sheet(("Scn " + sc["name"])[:31].replace("/", "-"), rows, [12, 12, 12, 12, 12, 12])

    jr = [["Module", "Justification"],
          ["Calculation", analysis["formula"]],
          ["Uncertainty", analysis["uncertainty"]["justification"]],
          ["Target", analysis["target"]["justification"]],
          ["Readiness", analysis["readiness"]["justification"]]]
    if analysis.get("benchmark"):
        jr.append(["Benchmark", analysis["benchmark"]["justification"]])
    for d in analysis.get("drivers", []):
        jr.append([d["label"], d["justification"]])
    for a in analysis.get("anomalies", []):
        jr.append([f"Data check ({a['severity']})", a["message"]])
    sheet("Justification", jr, [28, 110])

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def build_template() -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "CarbonAI data"
    ws.append(["Field", "Value", "Notes"])
    for c in ws[1]:
        c.fill, c.font = PatternFill("solid", fgColor=GREEN), Font(color="FFFFFF", bold=True)
    rows = [
        ("Company name", "", ""), ("Industry", "", "technology / manufacturing / retail / logistics / healthcare / ..."),
        ("Employees", "", ""), ("Location", "", "City, State"), ("Annual revenue (INR crore)", "", "optional — enables revenue intensity"),
        ("Renewable electricity share (%)", "", "0–100"), ("Reporting period", "annual", "annual / quarterly / monthly"),
        ("Electricity (kWh)", "", "sum of 'units consumed' on all bills"), ("Natural gas (m3)", "", "SCM on PNG bills"),
        ("Petrol (litres)", "", "company cars"), ("Diesel (litres)", "", "vehicles + DG sets"),
        ("Air travel (passenger-km)", "", "Delhi–Mumbai ≈ 1,150 km one way"), ("Hotels (room-nights)", "", ""),
        ("Employee commuting (passenger-km)", "", "employees × km/day × 2 × working days"), ("Waste to landfill (kg)", "", ""),
    ]
    for r in rows:
        ws.append(list(r))
    ws.column_dimensions["A"].width = 36
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 60
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
