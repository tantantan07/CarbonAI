import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Slider from './Slider';

export default function WhatIfSimulator({ companyId, baseline }) {
  const [renewableMix, setRenewableMix] = useState(0);
  const [travelReduction, setTravelReduction] = useState(0);
  const [wasteRecycling, setWasteRecycling] = useState(0);

  const energyBaseline = Number(baseline?.energy_kg ?? 0);
  const travelBaseline = Number(baseline?.travel_kg ?? 0);
  const wasteBaseline = Number(baseline?.waste_kg ?? 0);

  const simulatedEnergy = energyBaseline * (1 - renewableMix / 100);
  const simulatedTravel = travelBaseline * (1 - travelReduction / 100);
  const simulatedWaste = wasteBaseline * (1 - wasteRecycling / 100);

  const totalBaseline = energyBaseline + travelBaseline + wasteBaseline;
  const totalSimulated = simulatedEnergy + simulatedTravel + simulatedWaste;
  const totalSaved = Math.max(0, totalBaseline - totalSimulated);

  const chartData = useMemo(() => [
    { category: 'Energy', baseline: energyBaseline, simulated: simulatedEnergy },
    { category: 'Travel', baseline: travelBaseline, simulated: simulatedTravel },
    { category: 'Waste', baseline: wasteBaseline, simulated: simulatedWaste },
  ], [energyBaseline, travelBaseline, wasteBaseline, simulatedEnergy, simulatedTravel, simulatedWaste]);

  const chartMax = Math.max(...chartData.flatMap((item) => [item.baseline, item.simulated]), 1);

  const exportPDF = async () => {
    const element = document.getElementById('simulator-report');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      let heightLeft = contentHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = margin - (contentHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save('CarbonAI_Simulation_Report.pdf');
    } catch (error) {
      console.error('PDF export failed:', error);
    }
  };

  return (
    <section id="simulator-report" className="carbon-simulator">
      <div className="carbon-simulator-header">
        <div>
          <span className="carbon-simulator-eyebrow">SCENARIO PLANNING</span>
          <h2>What-If Scenario Simulator</h2>
          <p>Adjust sustainability levers to project potential carbon reductions.</p>
        </div>
        <button type="button" onClick={exportPDF} className="carbon-simulator-export">
          Export Report (PDF)
        </button>
      </div>

      <div className="carbon-simulator-grid">
        <div>
          <div className="carbon-simulator-section-title">
            <h3>Reduction Levers</h3>
            <span>Adjust to explore scenarios</span>
          </div>

          <div className="carbon-simulator-controls">
            <div className="carbon-simulator-control">
              <Slider label="Renewable Energy Mix" value={renewableMix} onChange={setRenewableMix} />
            </div>
            <div className="carbon-simulator-control">
              <Slider label="Business Travel Reduction" value={travelReduction} onChange={setTravelReduction} />
            </div>
            <div className="carbon-simulator-control">
              <Slider label="Waste Diversion / Recycling" value={wasteRecycling} onChange={setWasteRecycling} />
            </div>
          </div>

          <div className="carbon-simulator-impact">
            <span>Projected annual impact</span>
            <strong>-{totalSaved.toFixed(1)} <small>kg CO₂e / yr</small></strong>
            <p>Estimated reduction compared with the current baseline.</p>
          </div>
        </div>

        <div className="carbon-simulator-chart-panel">
          <div className="carbon-simulator-section-title">
            <div>
              <h3>Emissions Comparison</h3>
              <span>Baseline vs simulated annual emissions</span>
            </div>
          </div>

          <div className="carbon-bar-chart" role="img" aria-label="Baseline versus simulated annual emissions comparison">
            <div className="carbon-chart-y-labels" aria-hidden="true">
              <span>{chartMax.toFixed(0)}</span>
              <span>{(chartMax / 2).toFixed(0)}</span>
              <span>0</span>
            </div>
            <div className="carbon-chart-plot">
              {chartData.map((item) => (
                <div className="carbon-chart-category" key={item.category}>
                  <div className="carbon-chart-bars">
                    <div className="carbon-chart-bar carbon-chart-bar-baseline" style={{ height: `${Math.max((item.baseline / chartMax) * 100, item.baseline > 0 ? 3 : 0)}%` }} title={`Baseline: ${item.baseline.toFixed(1)} kg CO₂e`} />
                    <div className="carbon-chart-bar carbon-chart-bar-simulated" style={{ height: `${Math.max((item.simulated / chartMax) * 100, item.simulated > 0 ? 3 : 0)}%` }} title={`Simulated: ${item.simulated.toFixed(1)} kg CO₂e`} />
                  </div>
                  <span>{item.category}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="carbon-chart-legend">
            <span><i className="carbon-legend-baseline" /> Baseline</span>
            <span><i className="carbon-legend-simulated" /> Simulated</span>
          </div>
        </div>
      </div>
    </section>
  );
}
