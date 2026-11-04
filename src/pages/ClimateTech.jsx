import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { inr, SCOPE_HEX, t } from '../lib/format';
import { Why } from '../components/Bits';
import { listClimateTech, simulateSwitches } from '../services/api';
import { NeedData } from './CeoDashboard';

export default function ClimateTech() {
  const { analysis, cleanProfile, cleanInputs, hasData } = useStore();
  const [tech, setTech] = useState([]);
  const [sw, setSw] = useState({});
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { listClimateTech().then(setTech).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!hasData) return undefined;
    const h = setTimeout(() => {
      simulateSwitches(cleanProfile, cleanInputs, sw).then((r) => { setRes(r); setErr(''); }).catch((e) => setErr(e.message));
    }, 300);
    return () => clearTimeout(h);
  }, [sw, cleanProfile, cleanInputs, hasData]);

  if (!hasData || !analysis) return <><div className="page-head"><div><h1>Climate-tech switch</h1></div></div><NeedData /></>;

  const byId = Object.fromEntries((res?.switches || []).map((s) => [s.id, s]));
  const macById = Object.fromEntries(analysis.mac_curve.map((m) => [m.id, m]));
  const macData = analysis.mac_curve.filter((m) => m.mac_inr_per_tco2e != null).map((m) => ({ name: m.name.split(/[+/(]/)[0].trim(), mac: m.mac_inr_per_tco2e, scope: m.scope }));

  return (
    <>
      <div className="page-head">
        <div><h1>Switch your climate tech</h1><p>Turn technologies on and set how far you'd roll them out. We recalculate emissions, capex, savings and payback for {cleanProfile.name || 'your company'} as you go.</p></div>
      </div>
      {err && <div className="banner">{err}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        <div className="panel">
          {tech.map((x) => {
            const r = byId[x.id];
            const on = (sw[x.id] || 0) > 0;
            const solo = macById[x.id];
            return (
              <div className="switch-row" key={x.id}>
                <div>
                  <h4><span className="dot" style={{ background: SCOPE_HEX[x.scope] }} />{x.name}</h4>
                  <p>{x.simple}</p>
                  {on && r ? (
                    <p className="small" style={{ color: 'var(--ink)', marginTop: 4 }}>
                      {r.abatement_tco2e >= 0 ? `−${t(r.abatement_tco2e, 2)}` : `+${t(-r.abatement_tco2e, 2)}`} t a year, capex {inr(r.capex_inr)}, saves {inr(r.annual_saving_inr)}/yr{r.payback_years ? `, ${r.payback_years} yr payback` : ''}
                    </p>
                  ) : solo ? <p className="small">At full rollout: {solo.abatement_tco2e >= 0 ? `−${t(solo.abatement_tco2e, 1)} t a year` : `+${t(-solo.abatement_tco2e, 1)} t a year more`}</p> : null}
                  {(r?.warning || (!on && solo?.warning)) && <p className="warn-text">{r?.warning || solo.warning}</p>}
                  {on && r && <Why label="Show the calculation">{r.justification} Policy context: {x.policy}.</Why>}
                </div>
                <div className="field">
                  <label htmlFor={`sw-${x.id}`} className="small">Rollout: {Math.round((sw[x.id] || 0) * 100)}%</label>
                  <input id={`sw-${x.id}`} type="range" min="0" max="1" step="0.1" value={sw[x.id] || 0} onChange={(e) => setSw({ ...sw, [x.id]: +e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ alignContent: 'start', position: 'sticky', top: 20 }}>
          <div className="panel hero-kpi">
            <div className="kpi"><span className="l">After these switches</span><span className="v">{t(res?.after_tco2e ?? analysis.total_tco2e)} t</span>
              <span className="d">from {t(analysis.total_tco2e)} t today{res ? `, ${res.reduction_pct}% lower` : ''}</span></div>
          </div>
          <div className="grid g2">
            <div className="panel kpi"><span className="l">Capex</span><span className="v" style={{ fontSize: 26 }}>{inr(res?.total_capex_inr || 0)}</span></div>
            <div className="panel kpi"><span className="l">Saved every year</span><span className="v" style={{ fontSize: 26 }}>{inr(res?.total_annual_saving_inr || 0)}</span></div>
          </div>
          <div className="panel">
            <h2>Cost per tonne avoided</h2>
            <p className="sub">Each technology alone at full rollout. Below zero means it saves money for every tonne it cuts.</p>
            <ResponsiveContainer width="100%" height={Math.max(200, macData.length * 30)}>
              <BarChart data={macData} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid stroke="#C9D6CC" strokeDasharray="2 4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <ReferenceLine x={0} stroke="#0F2B2E" />
                <Tooltip formatter={(v) => `${inr(v)} per tonne`} />
                <Bar dataKey="mac" radius={4}>{macData.map((m) => <Cell key={m.name} fill={SCOPE_HEX[m.scope]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
            <Why>Marginal abatement cost = (capex × capital recovery factor − annual saving) ÷ tonnes avoided, using an 8% discount rate and a 10-year life. Prices are typical Indian commercial rates (grid ₹8/kWh, diesel ₹90/L, solar ₹45,000/kW).</Why>
          </div>
        </div>
      </div>
    </>
  );
}
