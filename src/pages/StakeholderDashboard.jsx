import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { SCOPE_HEX, t } from '../lib/format';
import { Markdown, ModelBadge, Why } from '../components/Bits';
import { agentChat, downloadReport } from '../services/api';
import { ForecastChart, NeedData } from './CeoDashboard';

const PLAIN = {
  1: 'Fuel your company burns itself — in vehicles, generators and boilers.',
  2: 'Electricity you buy. The power plant emits it, but you used the power.',
  3: 'Emissions your business causes elsewhere: flights, hotels, commutes and waste.',
};

export default function StakeholderDashboard() {
  const { analysis, profile, cleanProfile, cleanInputs, settings, hasData } = useStore();
  const [stmt, setStmt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dl, setDl] = useState('');

  if (!hasData || !analysis) return <><div className="page-head"><div><h1>Stakeholder view</h1></div></div><NeedData /></>;
  const a = analysis;
  const eq = a.equivalents;

  const ask = async (agent, q) => {
    setBusy(true); setErr('');
    try { setStmt(await agentChat(agent, cleanProfile, cleanInputs, [{ role: 'user', content: q }], settings.engine, { url: settings.localUrl, model: settings.localModel })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const download = async (fmt) => {
    setDl(`Preparing ${fmt.toUpperCase()}…`);
    try { await downloadReport(fmt, { profile: cleanProfile, inputs: cleanInputs, audience: 'stakeholder' }, settings.engine === 'browser-lmstudio' ? 'nugen' : settings.engine); setDl(''); } catch (e) { setDl(`Couldn't create the file: ${e.message}`); }
  };

  const factorRows = Object.entries(a.factors_used).map(([k, f]) => ({ k, ...f, activity: a.activity[k], tco2e: a.category_totals[k] }));
  const unc = factorRows.filter((r) => r.tco2e > 0).map((r) => ({ name: r.label.split(' (')[0], value: r.tco2e, scope: r.scope }));

  return (
    <>
      <div className="page-head">
        <div><h1>{profile.name || 'Company'}: stakeholder view</h1><p>For investors, auditors, customers and anyone new to carbon. How much, what it means, and exactly how we got there.</p></div>
        <div className="row">
          <button type="button" className="btn btn-ink btn-sm" onClick={() => download('pdf')}>Disclosure (PDF)</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => download('xlsx')}>Data (Excel)</button>
          {dl && <span className="small">{dl}</span>}
        </div>
      </div>

      <div className="grid g3">
        {[1, 2, 3].map((s) => (
          <div className="panel kpi" key={s} style={{ borderTop: `5px solid ${SCOPE_HEX[s]}` }}>
            <span className="l">Scope {s}</span>
            <span className="v">{t(a.scope_totals[`scope${s}`])} t</span>
            <span className="small">{PLAIN[s]}</span>
          </div>
        ))}
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>In everyday terms</h2>
          <p className="sub">{t(a.total_tco2e)} tonnes of CO₂e a year is about the same as:</p>
          <div className="grid g2">
            <div className="kpi"><span className="v">{t(eq.trees_one_year, 0)}</span><span className="l">trees absorbing CO₂ for a year</span></div>
            <div className="kpi"><span className="v">{t(eq.car_km / 1e5, 1)} lakh km</span><span className="l">driven in a petrol car</span></div>
            <div className="kpi"><span className="v">{t(eq.indian_homes_power_year, 0)}</span><span className="l">Indian homes' electricity for a year</span></div>
            <div className="kpi"><span className="v">{t(eq.delhi_mumbai_flights, 0)}</span><span className="l">Delhi–Mumbai flights</span></div>
          </div>
          <Why>Trees ≈ 22 kg CO₂ each per year; car ≈ 170 g/km; home ≈ 1,200 kWh × 0.727 kg; flight ≈ 1,150 km × 0.15 kg per passenger-km.</Why>
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('terra', 'Explain our footprint to someone who has never heard of carbon accounting.')}>Explain it simply (Terra)</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('lex', 'Write a neutral disclosure statement with method, uncertainty and data caveats.')}>Disclosure statement (Lex)</button>
          </div>
          {busy && <p className="small" style={{ marginTop: 10 }}><span className="loading-dot" /> Writing…</p>}
          {err && <div className="banner" style={{ marginTop: 10 }}>{err}</div>}
          {stmt && <div className="msg bot" style={{ maxWidth: 'none', marginTop: 12 }}><Markdown text={stmt.reply} /><ModelBadge meta={stmt.meta} /></div>}
        </div>

        <div className="panel">
          <h2>How sure are we?</h2>
          <p className="sub">80% confidence the true footprint is between {t(a.uncertainty.p10)} and {t(a.uncertainty.p90)} t.</p>
          <div style={{ position: 'relative', height: 34, margin: '6px 0 18px', background: 'var(--paper)', borderRadius: 8 }}>
            {(() => {
              const lo = a.uncertainty.p10 * 0.95; const hi = a.uncertainty.p90 * 1.05; const pos = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
              return <>
                <div style={{ position: 'absolute', top: 8, bottom: 8, left: pos(a.uncertainty.p10), right: `calc(100% - ${pos(a.uncertainty.p90)})`, background: 'var(--ink-3)', borderRadius: 4, opacity: .35 }} />
                <div style={{ position: 'absolute', top: 2, bottom: 2, width: 3, left: pos(a.total_tco2e), background: 'var(--ink)' }} />
              </>;
            })()}
          </div>
          <Why label="How was this range calculated?">{a.uncertainty.justification}</Why>
          <h2 style={{ marginTop: 18 }}>Compared with peers</h2>
          {a.benchmark ? <>
            <p>{a.benchmark.per_employee} t per employee against a peer median of {a.benchmark.peer_median} t: {a.benchmark.verdict}.</p>
            <Why>{a.benchmark.justification}</Why>
          </> : <p className="muted">Add headcount to compare with peers.</p>}
          <h2 style={{ marginTop: 18 }}>Data-quality flags</h2>
          {a.anomalies.length === 0 ? <p className="muted">None found.</p> : a.anomalies.map((f, i) => <div className="flag" key={i}><span className={`tag ${f.severity}`}>{f.severity}</span><span>{f.message}</span></div>)}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Method and sources</h2>
        <p className="sub">GHG Protocol Corporate Standard, operational control, location-based Scope 2. {a.formula}.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Category</th><th>Scope</th><th className="num">Activity</th><th className="num">Factor (tCO₂e per unit)</th><th className="num">tCO₂e</th><th>Source</th></tr></thead>
            <tbody>{factorRows.map((r) => (
              <tr key={r.k}><td>{r.label}</td><td><span className="dot" style={{ background: SCOPE_HEX[r.scope] }} />{r.scope}</td><td className="num">{t(r.activity, 0)} {r.unit}</td><td className="num">{r.value}</td><td className="num">{t(r.tco2e, 2)}</td><td className="small">{r.source}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="panel"><h2>Emissions by source</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={unc} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `${t(v)} t`} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>{unc.map((u) => <Cell key={u.name} fill={SCOPE_HEX[u.scope]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel"><h2>Trajectory and target</h2><p className="sub">{a.target.pathway}</p><ForecastChart analysis={a} height={220} /><Why>{a.target.justification}</Why></div>
      </div>
      
    </>
  );
}
