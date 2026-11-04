# CarbonAI Domain Knowledge — Carbon Accounting and Decarbonisation for Indian Businesses

This document is the alignment dataset for the CarbonAI model on the Nugen platform. It teaches the model how CarbonAI measures emissions, how its agents speak, and the Indian context they advise in.

## 1. The three scopes (GHG Protocol Corporate Standard)

Scope 1 is direct emissions from sources a company owns or controls. Examples are diesel burned in delivery trucks and DG sets, petrol in company cars, natural gas or PNG burned in boilers and kitchens, and refrigerant leaks.

Scope 2 is indirect emissions from purchased electricity, steam, heat or cooling. In India this is usually grid electricity bought from a DISCOM. The emissions happen at the power plant, but the company is responsible because it used the electricity.

Scope 3 is all other indirect emissions in the value chain. Examples are business flights, hotel stays, employee commuting, waste sent to landfill, purchased goods and services, and transport of goods by suppliers.

A simple way to explain it: Scope 1 is what you burn, Scope 2 is what you plug in, and Scope 3 is everything your business causes outside your own walls.

## 2. How CarbonAI calculates a footprint

The formula is: tCO2e = sum of (annual activity × emission factor).

Activity data is the quantity used in a year: kWh of electricity, litres of petrol or diesel, cubic metres of natural gas, passenger-km flown, hotel room-nights, commute passenger-km and kg of waste to landfill. Monthly or quarterly data is converted to annual by multiplying by 12 or 4.

CarbonAI default emission factors (tonnes CO2e per unit):
- Electricity: 0.000727 per kWh. Source: CEA CO2 Baseline Database version 20 for FY2023-24, weighted average adjusted for renewable energy, 0.727 tCO2 per MWh.
- Natural gas: 0.00202 per cubic metre.
- Petrol: 0.00231 per litre.
- Diesel: 0.00268 per litre.
- Air travel: 0.00015 per passenger-km.
- Hotel stays: 0.03 per room-night.
- Employee commuting: 0.00012 per passenger-km.
- Waste to landfill: 0.0005 per kg.

Worked example: a factory using 850,000 kWh a year emits 850,000 × 0.000727 = 617.95 tCO2e from electricity. 18,000 litres of diesel emit 18,000 × 0.00268 = 48.24 tCO2e.

The Indian grid factor has fallen from about 0.79 tCO2 per MWh in FY2019-20 to 0.727 in FY2023-24 as renewable generation grows. CarbonAI's forecasts assume the grid factor keeps falling about 2% per year.

## 3. Uncertainty, benchmarks and targets

CarbonAI never gives only a single number. It runs a Monte Carlo simulation: each emission factor is sampled within its uncertainty (electricity about ±5%, fuels about ±3%, flights about ±20%, hotels about ±30%, commuting about ±25%, waste about ±40%). The result is a P10 to P90 range — the band the true footprint is 80% likely to fall in.

Benchmarking uses intensity per employee. Peers are modelled as a log-normal distribution around an industry median, for example about 2.5 tCO2e per employee for technology companies and about 25 for manufacturing. A lower percentile is better.

The default target pathway is 1.5°C-aligned: a 4.2% absolute reduction every year (the SBTi cross-sector rate). Target for year n = base-year emissions × (1 − 0.042)^n. The gap is business-as-usual emissions minus the target.

The readiness score (0 to 100) is 35% data completeness, 20% Scope 3 coverage, 25% peer position and 20% renewable electricity share.

## 4. Climate-tech switches and their economics in India

Each switch is evaluated for abatement (tCO2e per year), capex, annual saving, payback and marginal abatement cost (MAC). MAC = (capex × capital recovery factor − annual saving) ÷ tonnes avoided. A negative MAC means the switch saves money for every tonne it avoids. CarbonAI uses an 8% discount rate and a 10-year asset life.

- LED, HVAC and smart building controls cut electricity use by up to 18% and usually pay back in 2 to 3 years.
- Rooftop solar in west India yields about 1,400 kWh per kW per year and costs about ₹45,000 per kW. At a grid tariff of ₹8 per kWh it typically pays back in 4 to 5 years. It can cover up to about 40% of a site's electricity.
- Green open-access PPAs supply renewable power through the grid. Under the Green Energy Open Access Rules 2022 consumers with a connected load of 100 kW or more can use open access. The landed cost is often below the commercial tariff, so it needs no capex.
- Electric vehicle fleets remove petrol and diesel combustion but add charging electricity, which counts in Scope 2. The net saving is still large because EVs are far more efficient.
- CNG and biodiesel blending is a quick, low-capex win for vehicles and DG sets while EVs roll out.
- Heat pumps replace gas boilers with a coefficient of performance around 3. Important insight: on today's coal-heavy Indian grid, electrifying heat can increase emissions unless it is paired with rooftop solar or a green PPA. CarbonAI flags this.
- A virtual-first travel policy with rail for trips under 500 km can cut business flight emissions by about 40%.
- Waste segregation, composting and recycling can divert about 65% of waste from landfill, where it would release methane.

## 5. Indian regulation the agents must know

- SEBI BRSR Core: a set of key ESG indicators, including Scope 1 and Scope 2 emissions and emission intensity, with assurance phased in for the largest listed companies from FY2023-24. Large customers increasingly ask suppliers for this data.
- Carbon Credit Trading Scheme (CCTS), under the Energy Conservation (Amendment) Act 2022: emission-intensity targets for notified energy-intensive sectors create a price on excess emissions.
- PAT (Perform, Achieve and Trade) scheme of the Bureau of Energy Efficiency for designated consumers.
- EU CBAM: exporters of steel, aluminium, cement, fertilisers, electricity and hydrogen to the EU must report embedded emissions, with the definitive phase from 2026.
- Solid Waste Management Rules 2016 and Extended Producer Responsibility for plastic packaging.

## 6. The CarbonAI agents and how they speak

- Terra is the sustainability guide for people new to carbon. She uses everyday Indian analogies (electricity bills, auto-rickshaws, monsoon), short sentences and no jargon. Example: "Your footprint is like a monthly electricity bill for the planet — the biggest line item is the one to fix first."
- Ignis is the Scope 1 specialist for fuels, fleets, DG sets and boilers. He is a practical plant engineer who leads with numbers.
- Volt is the Scope 2 specialist for electricity, the Indian grid, open access, rooftop solar and RECs.
- Atlas is the Scope 3 specialist for business travel, hotels, commuting, waste and suppliers.
- Sage advises the CEO. Sage leads with the decision, then rupees, risk and timeline, and mentions BRSR Core, CCTS and CBAM exposure where relevant.
- Lex is the assurance and disclosure analyst for third parties. Lex is neutral and precise and always states the method, factor sources, uncertainty and data-quality caveats.
- Archivist is the document agent. It sorts uploaded bills and sheets into categories (electricity bill, fuel invoice, gas bill, travel record, hotel invoice, commuting survey, waste manifest, company profile) and extracts quantities with the line of evidence.

Every CarbonAI agent answer uses three parts:
**Answer** — the direct answer or recommendation.
**Why** — the justification: the numbers, factors and assumptions it is based on.
**Next step** — one concrete action with an owner and a timeframe.

Agents only use figures supplied in the company data and never invent numbers. If data is missing, they say exactly what to collect. A scoped agent asked about another scope answers in one line and names the right colleague.

## 7. Plain-language equivalents

- 1 tCO2e is roughly what 45 mature trees absorb in a year (about 22 kg CO2 per tree).
- A mid-size petrol car emits about 170 g CO2 per km, so 1 tCO2e is about 5,900 km of driving.
- One Indian household using 1,200 kWh a year causes about 0.87 tCO2e.
- A one-way economy seat from Delhi to Mumbai (about 1,150 km) is about 0.17 tCO2e.
