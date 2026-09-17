import React, { useEffect, useState } from 'react';
import { getDashboardResults } from '../services/api';
import WhatIfSimulator from '../components/simulator/WhatIfSimulator';
import ActionPlanList from '../components/recommendations/ActionPlanList';
import './Dashboard.css';

export default function Dashboard({ companyId = null, onRestart }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        setError('');
        const results = await getDashboardResults();
        setData(results);
      } catch (err) {
        console.error('Dashboard data fetch failed:', err);
        setData(null);
        setError(
          err?.response?.data?.detail ||
          'No assessment data found. Complete an assessment first.'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [companyId]);

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-shell dashboard-state">
          <div className="dashboard-spinner" aria-hidden="true" />
          <p>Loading your CarbonAI dashboard...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-shell dashboard-state dashboard-empty">
          <span className="dashboard-eyebrow">CARBONAI DASHBOARD</span>
          <h1>No assessment yet</h1>
          <p>{error || 'Complete your company assessment to see your carbon dashboard.'}</p>
          <button type="button" className="dashboard-button dashboard-button-primary" onClick={onRestart}>
            ↻ Start assessment
          </button>
        </div>
      </main>
    );
  }

  const totalTco2e = Number(data.total_tco2e || 0);
  const totalKgco2e = Number(data.total_kgco2e || totalTco2e * 1000);
  const breakdown = data.breakdown || {};
  const energy = Number(breakdown.energy_kg || 0);
  const travel = Number(breakdown.travel_kg || 0);
  const waste = Number(breakdown.waste_kg || 0);

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">YOUR CARBON DASHBOARD</span>
            <h1>{data.company_name || 'Company Dashboard'}</h1>
            <p>Carbon footprint overview based on your latest assessment.</p>
          </div>

          <button type="button" className="dashboard-button dashboard-button-secondary" onClick={onRestart}>
            ↻ Restart assessment
          </button>
        </header>

        <section className="dashboard-metrics" aria-label="Carbon footprint summary">
          <article className="dashboard-metric dashboard-metric-featured">
            <span>Total emissions</span>
            <strong>{totalTco2e.toFixed(2)} tCO₂e</strong>
            <small>{totalKgco2e.toFixed(0)} kg CO₂e</small>
          </article>
          <article className="dashboard-metric">
            <span>Energy</span>
            <strong>{energy.toFixed(1)} kg</strong>
            <small>CO₂e annually</small>
          </article>
          <article className="dashboard-metric">
            <span>Travel</span>
            <strong>{travel.toFixed(1)} kg</strong>
            <small>CO₂e annually</small>
          </article>
          <article className="dashboard-metric">
            <span>Waste</span>
            <strong>{waste.toFixed(1)} kg</strong>
            <small>CO₂e annually</small>
          </article>
        </section>

        <WhatIfSimulator companyId={data.company_id} baseline={breakdown} />
        <ActionPlanList companyId={data.company_id} />
      </div>
    </main>
  );
}
