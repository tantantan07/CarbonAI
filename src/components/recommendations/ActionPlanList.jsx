import React, { useEffect, useState } from 'react';
import { getActionPlan } from '../../services/api';

const fallbackPlan = [
  {
    title: 'Reduce your largest emission source first',
    detail: 'Use the emissions breakdown above to prioritize the category with the highest annual CO₂e contribution. Set a measurable reduction target and review it monthly.',
  },
  {
    title: 'Improve energy efficiency',
    detail: 'Audit electricity and fuel consumption, remove avoidable usage, and evaluate renewable electricity options where practical.',
  },
  {
    title: 'Cut travel-related emissions',
    detail: 'Consolidate business trips, prefer lower-emission travel options where feasible, and use virtual meetings for trips that do not require physical presence.',
  },
];

function parsePlan(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

export default function ActionPlanList() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadActionPlan() {
      try {
        setLoading(true);
        setError('');
        const result = await getActionPlan();
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('AI action plan fetch failed:', err);
        if (!cancelled) {
          setData(null);
          setError(
            err?.response?.data?.detail ||
            err?.message ||
            'The AI service is temporarily unavailable.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadActionPlan();
    return () => { cancelled = true; };
  }, []);

  const recommendations = parsePlan(data?.action_plan);
  const usingFallback = recommendations.length === 0;

  if (loading) {
    return (
      <section className="carbon-action-plan carbon-action-plan-loading">
        <div className="carbon-action-header">
          <div>
            <span className="carbon-action-eyebrow">AI SUSTAINABILITY ADVISOR</span>
            <h2>AI Recommended Action Plan</h2>
          </div>
          <span className="carbon-action-status">Analyzing</span>
        </div>
        <div className="carbon-action-loading-line" />
        <p>Generating recommendations from your latest assessment...</p>
      </section>
    );
  }

  return (
    <section className="carbon-action-plan">
      <div className="carbon-action-header">
        <div>
          <span className="carbon-action-eyebrow">AI SUSTAINABILITY ADVISOR</span>
          <h2>AI Recommended Action Plan</h2>
          <p>Practical next steps based on your current emissions profile.</p>
        </div>
        {usingFallback ? (
          <span className="carbon-action-status">Ready</span>
        ) : (
          <span className="carbon-action-status">AI generated</span>
        )}
      </div>

      {data && (
        <div className="carbon-scope-grid">
          <div><span>Scope 1</span><strong>{Number(data.scope1 || 0).toFixed(2)} tCO₂e</strong></div>
          <div><span>Scope 2</span><strong>{Number(data.scope2 || 0).toFixed(2)} tCO₂e</strong></div>
          <div><span>Scope 3</span><strong>{Number(data.scope3 || 0).toFixed(2)} tCO₂e</strong></div>
        </div>
      )}

      {usingFallback ? (
        <div className="carbon-fallback-note">
          {error ? 'AI recommendations are temporarily unavailable, so CarbonAI is showing practical baseline actions instead of an empty result.' : 'CarbonAI is showing practical baseline actions for this assessment.'}
        </div>
      ) : (
        <div className="carbon-action-list">
          {recommendations.map((item, index) => (
            <article className="carbon-action-item" key={`${item}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      )}

      {usingFallback && (
        <div className="carbon-action-list">
          {fallbackPlan.map((item, index) => (
            <article className="carbon-action-item" key={item.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
