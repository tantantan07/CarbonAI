import { useEffect, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { inr, SCOPE_HEX, t } from '../lib/format';
import { Why } from '../components/Bits';
import { listClimateTech, runScenarios } from '../services/api';
import { NeedData } from './CeoDashboard';

const PRESETS = [
  { name: 'Quick wins', scope: 'all', resolution: 'quarterly', horizon_years: 3, ramp_years: 1, growth_rate: '', switches: { efficiency: 1, travel_policy: 0.6, waste_circular: 1, cng_biofuel: 0.5 } },
  { name: 'Green power', scope: '2', resolution: 'annual', horizon_years: 5, ramp_years: 2, growth_rate: '', switches: { efficiency: 1, rooftop_solar: 1, green_ppa: 0.7 } },
  { name: 'Fleet first', scope: '1', resolution: 'monthly', horizon_years: 2, ramp_years: 2, growth_rate: '', switches: { ev_fleet: 0.6, cng_biofuel: 1 } },
];

export default function Scenarios() {
  const { cleanProfile, cleanInputs, hasData } = useStore();
  const [tech, setTech] = useState([]);
  const [list, setList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cai.scenarios')) || PRESETS; } catch { return PRESETS; }
  });
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { listClimateTech().then(setTech).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem('cai.scenarios', JSON.stringify(list)); } catch { /* ignore */ } }, [list]);

  if (!hasData) return <><div className="page-head"><div><h1>Scenarios</h1></div></div><NeedData /></>;

  const upd = (i, patch) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const run = async () => {
    setBusy(true); setErr('');
    try {
      const payload = list.map((s) => ({ ...s, growth_rate: s.growth_rate === '' ? null : Number(s.growth_rate) }));
      setRes(await runScenarios(cleanProfile, cleanInputs, payload)); setSel(0);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const chosen = res?.scenarios?.[sel];

  return (
    <>
      <div className="page-head">
        <div><h1>Scenario planner</h1><p>Build up to six futures. Choose the scope each one may change, the time resolution and how fast the switches roll out.</p></div>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" disabled={list.length >= 6} onClick={() => setList([...list, { name: `Scenario ${list.length + 1}`, scope: 'all', resolution: 'annual', horizon_years: 5, ramp_years: 3, growth_rate: '', switches: {} }])}>Add scenario</button>
          <button type="button" className="btn btn-ink" onClick={run} disabled={busy || !list.length}>{busy ? 'Running…' : 'Compare scenarios'}</button>
        </div>
      </div>
      {err && <div className="banner">{err}</div>}

      <div className="grid g3">
        {list.map((s, i) => {
          const r = res?.scenarios?.find((x) => x.name === s.name);
          const allowed = tech.filter((x) => s.scope === 'all' || String(x.scope) === String(s.scope));
          return (
            <div key={i} className={`scn-card ${res?.recommended === s.name ? 'best' : ''}`}>
              <div className="row"><input className="input" aria-label="Scenario name" value={s.name} onChange={(e) => upd(i, { name: e.target.value })} style={{ fontWeight: 700 }} />
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${s.name}`} onClick={() => setList(list.filter((_, j) => j !== i))}>Remove</button></div>
              {res?.recommended === s.name && <span className="small" style={{ color: 'var(--leaf-deep)', fontWeight: 700 }}>Recommended, scores {r?.score}/100</span>}
              <div className="grid g2">
                <div className="field"><label>Scope</label><select className="select" value={s.scope} onChange={(e) => upd(i, { scope: e.target.value })}><option value="all">Whole company</option><option value="1">Scope 1 only</option><option value="2">Scope 2 only</option><option value="3">Scope 3 only</option></select></div>
                <div className="field"><label>Resolution</label><select className="select" value={s.resolution} onChange={(e) => upd(i, { resolution: e.target.value })}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Yearly</option></select></div>
                <div className="field"><label>Horizon (years)</label><input className="input" type="number" min="1" max="10" value={s.horizon_years} onChange={(e) => upd(i, { horizon_years: e.target.value })} /></div>
                <div className="field"><label>Full rollout in (years)</label><input className="input" type="number" min="0.5" step="0.5" value={s.ramp_years} onChange={(e) => upd(i, { ramp_years: e.target.value })} /></div>
              </div>
              <div className="field"><label>Growth (% a year)</label><input className="input" type="number" value={s.growth_rate} placeholder="Industry default" onChange={(e) => upd(i, { growth_rate: e.target.value })} /></div>
              <div>
                {allowed.map((x) => (
                  <div key={x.id} className="field" style={{ marginTop: 6 }}>
                    <label className="small" htmlFor={`${i}-${x.id}`}><span className="dot" style={{ background: SCOPE_HEX[x.scope] }} />{x.name}: {Math.round((s.switches[x.id] || 0) * 100)}%</label>
                    <input id={`${i}-${x.id}`} type="range" min="0" max="1" step="0.1" value={s.switches[x.id] || 0} onChange={(e) => upd(i, { switches: { ...s.switches, [x.id]: +e.target.value } })} />
                  </div>
                ))}
              </div>
              {r && <div className="small"><strong>−{r.reduction_vs_bau_pct}%</strong> vs doing nothing by the end, {t(r.cumulative_abatement_tco2e)} t avoided in total, capex {inr(r.capex_inr)}{r.payback_years ? `, ${r.payback_years} yr payback` : ''}. {r.meets_1p5_target ? 'Meets' : 'Misses'} the 1.5 °C path.</div>}
            </div>
          );
        })}
      </div>

      {res && (
        <>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Side by side</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Scenario</th><th>Scope</th><th>Resolution</th><th className="num">End vs doing nothing</th><th className="num">Total avoided</th><th className="num">Capex</th><th className="num">Saves a year</th><th className="num">Payback</th><th>1.5 °C</th><th className="num">Score</th><th /></tr></thead>
                <tbody>{res.scenarios.map((r, i) => (
                  <tr key={r.name} style={{ fontWeight: res.recommended === r.name ? 700 : 400 }}>
                    <td>{r.name}</td><td>{r.scope === 'all' ? 'All' : r.scope}</td><td>{r.resolution}</td><td className="num">−{r.reduction_vs_bau_pct}%</td><td className="num">{t(r.cumulative_abatement_tco2e)} t</td>
                    <td className="num">{inr(r.capex_inr)}</td><td className="num">{inr(r.annual_saving_inr)}</td><td className="num">{r.payback_years ? `${r.payback_years} yr` : '–'}</td><td>{r.meets_1p5_target ? 'Yes' : 'No'}</td><td className="num">{r.score}</td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(i)} aria-pressed={sel === i}>Chart</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Why label="How is the score calculated?">{res.justification}</Why>
          </div>
          {chosen && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h2>{chosen.name}</h2>
              <p className="sub">{chosen.resolution} steps over {chosen.horizon_years} years. Shaded areas are the scenario by scope; the dark line is doing nothing.</p>
              {chosen.switches_skipped_out_of_scope.length > 0 && <div className="banner">Skipped because they're outside Scope {chosen.scope}: {chosen.switches_skipped_out_of_scope.join(', ')}.</div>}
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chosen.series} margin={{ top: 8, right: 12, left: 0 }}>
                  <CartesianGrid stroke="#C9D6CC" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 12 }} width={52} />
                  <Tooltip formatter={(v) => `${t(v)} t`} />
                  <Legend />
                  <Area dataKey="scope1" name="Scope 1" stackId="s" fill={SCOPE_HEX[1]} stroke="none" fillOpacity={0.85} />
                  <Area dataKey="scope2" name="Scope 2" stackId="s" fill={SCOPE_HEX[2]} stroke="none" fillOpacity={0.85} />
                  <Area dataKey="scope3" name="Scope 3" stackId="s" fill={SCOPE_HEX[3]} stroke="none" fillOpacity={0.85} />
                  <Line dataKey="baseline" name="Doing nothing" stroke="#0F2B2E" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <Why>{chosen.justification}</Why>
            </div>
          )}
        </>
      )}
    </>
  );
}
