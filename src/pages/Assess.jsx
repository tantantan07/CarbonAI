import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { FIELDS, INDUSTRIES, SCOPE_HEX, t } from '../lib/format';
import { ScopeBar, Why } from '../components/Bits';
import { downloadTemplate, isAuthenticated, saveAssessment } from '../services/api';

const PRIORITIES = [
  ['cost', 'Cut costs'], ['compliance', 'BRSR / compliance'], ['customers', 'Customer & export demands'],
  ['brand', 'Brand and talent'], ['investors', 'Investors and lenders'],
];

export default function Assess() {
  const { profile, setProfile, inputs, setInputs, analysis, status, loadSample, reset, cleanProfile, cleanInputs } = useStore();
  const [step, setStep] = useState(0);
  const [saveMsg, setSaveMsg] = useState('');
  const nav = useNavigate();
  const P = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });
  const togglePriority = (k) => {
    const cur = Array.isArray(profile.priorities) ? profile.priorities : [];
    setProfile({ ...profile, priorities: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };

  const save = async () => {
    setSaveMsg('');
    try { await saveAssessment(cleanProfile, cleanInputs); setSaveMsg('Saved to your account.'); } catch (e) { setSaveMsg(`Couldn't save: ${e.message}`); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Measure your footprint</h1>
          <p>Tell us about the company, then add last year's activity. Results update as you type.</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadSample}>Fill with demo company</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear</button>
        </div>
      </div>

      <div className="steps" role="tablist">
        {['1. Company', '2. Activity data', '3. Review'].map((s, i) => (
          <button key={s} type="button" role="tab" aria-selected={step === i} className={step === i ? 'on' : ''} onClick={() => setStep(i)}>{s}</button>
        ))}
      </div>

      {step === 0 && (
        <div className="grid g2">
          <div className="panel grid">
            <h2>About the company</h2>
            <div className="field"><label htmlFor="n">Company name</label><input id="n" className="input" value={profile.name} onChange={P('name')} /></div>
            <div className="grid g2">
              <div className="field"><label htmlFor="ind">Industry</label>
                <select id="ind" className="select" value={profile.industry} onChange={P('industry')}>{INDUSTRIES.map((i) => <option key={i} value={i}>{i[0].toUpperCase() + i.slice(1)}</option>)}</select></div>
              <div className="field"><label htmlFor="emp">Employees</label><input id="emp" className="input" type="number" min="0" value={profile.employees} onChange={P('employees')} /></div>
              <div className="field"><label htmlFor="loc">Location</label><input id="loc" className="input" value={profile.location} onChange={P('location')} placeholder="Pune, Maharashtra" /></div>
              <div className="field"><label htmlFor="rev">Annual revenue (₹ crore)</label><input id="rev" className="input" type="number" min="0" value={profile.revenue_cr} onChange={P('revenue_cr')} /></div>
              <div className="field"><label htmlFor="gr">Expected growth (% a year)</label><input id="gr" className="input" type="number" value={profile.growth_rate} onChange={P('growth_rate')} placeholder="Industry default" /></div>
              <div className="field"><label htmlFor="cn">Your name</label><input id="cn" className="input" value={profile.contact_name} onChange={P('contact_name')} /></div>
            </div>
          </div>
          <div className="panel grid">
            <h2>Personalise the agents</h2>
            <p className="sub">Agents use this to choose what to recommend and how to explain it.</p>
            <div className="field"><label htmlFor="g">Your climate goal</label><textarea id="g" rows={2} className="input" value={profile.goals} onChange={P('goals')} placeholder="e.g. Net zero by 2040, BRSR-ready data for buyers" /></div>
            <div className="field"><label>What matters most</label>
              <div className="chips">{PRIORITIES.map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={(profile.priorities || []).includes(k)} onClick={() => togglePriority(k)}>{l}</button>)}</div></div>
            <div className="field"><label>Budget for changes</label>
              <div className="chips">{[['low', 'Little or none'], ['moderate', 'Moderate'], ['high', 'Ready to invest']].map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={profile.budget === k} onClick={() => setProfile({ ...profile, budget: k })}>{l}</button>)}</div></div>
            <div className="field"><label>How familiar are you with carbon accounting?</label>
              <div className="chips">{[['beginner', 'New to it'], ['intermediate', 'Know the basics'], ['expert', 'I do this for a living']].map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={profile.expertise === k} onClick={() => setProfile({ ...profile, expertise: k })}>{l}</button>)}</div></div>
            <div className="row"><span className="spacer" /><button type="button" className="btn btn-ink" onClick={() => setStep(1)}>Next: activity data</button></div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
          <div className="panel">
            <div className="row" style={{ marginBottom: 14 }}>
              <div className="field" style={{ width: 220 }}><label htmlFor="per">These numbers cover</label>
                <select id="per" className="select" value={profile.period} onChange={P('period')}><option value="annual">One year</option><option value="quarterly">One quarter</option><option value="monthly">One month</option></select></div>
              <div className="field" style={{ width: 240 }}><label htmlFor="re">Renewable share of electricity</label>
                <div className="input-unit"><input id="re" type="number" min="0" max="100" value={profile.renewable_share} onChange={P('renewable_share')} /><span>%</span></div></div>
            </div>
            {[1, 2, 3].map((scope) => (
              <div key={scope} style={{ marginTop: 18 }}>
                <h2><span className="dot" style={{ background: SCOPE_HEX[scope] }} />Scope {scope}</h2>
                <div className="grid g2" style={{ marginTop: 10 }}>
                  {FIELDS.filter((f) => f.scope === scope).map((f) => (
                    <div className="field" key={f.key}>
                      <label htmlFor={f.key}>{f.label}</label>
                      <div className="input-unit"><input id={f.key} type="number" min="0" value={inputs[f.key] || ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} /><span>{f.unit}</span></div>
                      <span className="hint">{f.hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ alignContent: 'start' }}>
            <div className="panel">
              <h2>Have bills instead?</h2>
              <p className="sub">The document agent reads PDFs, Excel and CSV files and fills these fields for you.</p>
              <div className="grid"><Link to="/app/documents" className="btn btn-ink btn-sm">Upload documents</Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadTemplate()}>Download Excel template</button></div>
            </div>
            <LiveTotal analysis={analysis} status={status} />
            <button type="button" className="btn btn-ink" onClick={() => setStep(2)}>Next: review</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid g2">
          <div className="panel">
            <LiveTotal analysis={analysis} status={status} bare />
            {analysis && (
              <div style={{ marginTop: 16 }}>
                <h2>Things to check</h2>
                {analysis.anomalies.length === 0 && <p className="muted">No data-quality issues found.</p>}
                {analysis.anomalies.map((a, i) => <div className="flag" key={i}><span className={`tag ${a.severity}`}>{a.severity}</span><span>{a.message}</span></div>)}
              </div>
            )}
          </div>
          <div className="panel grid" style={{ alignContent: 'start' }}>
            <h2>Where next</h2>
            <button type="button" className="btn btn-ink" onClick={() => nav('/app/ceo')}>Open the CEO dashboard</button>
            <button type="button" className="btn btn-ghost" onClick={() => nav('/app/stakeholder')}>Open the stakeholder dashboard</button>
            <button type="button" className="btn btn-ghost" onClick={() => nav('/app/agents')}>Ask the AI agents</button>
            {isAuthenticated() ? <button type="button" className="btn btn-ghost" onClick={save}>Save to my account</button> : <p className="muted small">Sign in from the sidebar to save this assessment.</p>}
            {saveMsg && <p className="small">{saveMsg}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function LiveTotal({ analysis, status, bare }) {
  const body = !analysis ? (
    <p className="muted">{status === 'loading' ? 'Calculating…' : 'Enter at least one value to see your footprint.'}</p>
  ) : (
    <>
      <div className="kpi"><span className="v">{t(analysis.total_tco2e)} t</span><span className="l">CO₂e a year {status === 'loading' && <span className="loading-dot" />}</span></div>
      <div style={{ margin: '12px 0' }}><ScopeBar scopes={analysis.scope_totals} total={analysis.total_tco2e} /></div>
      <div className="small">{[1, 2, 3].map((s) => <div key={s}><span className="dot" style={{ background: SCOPE_HEX[s] }} />Scope {s}: {t(analysis.scope_totals[`scope${s}`])} t</div>)}</div>
      <Why>{analysis.formula}. Range {t(analysis.uncertainty.p10)}–{t(analysis.uncertainty.p90)} t (80% confidence).</Why>
    </>
  );
  return bare ? body : <div className="panel">{body}</div>;
}
