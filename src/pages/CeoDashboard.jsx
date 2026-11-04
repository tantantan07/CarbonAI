import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { inr, SCOPE_HEX, t } from '../lib/format';
import { Markdown, ModelBadge, ScopeBar, Why } from '../components/Bits';
import { downloadReport, getInsights, simulateSwitches } from '../services/api';

export function NeedData() {
  return (
    <div className="panel">
      <h2>No assessment yet</h2>
      <p className="muted" style={{ margin: '6px 0 14px' }}>Add your activity data or load the demo company to see this dashboard.</p>
      <Link to="/app/assess" className="btn btn-ink btn-sm">Start the assessment</Link>
    </div>
  );
}

export function ForecastChart({ analysis, height = 260 }) {
  const base = analysis.target.base_year_total;
  const data = analysis.forecast_bau.map((r, i) => ({ ...r, band: [r.low, r.high], target: +(base * (1 - 0.042) ** i).toFixed(2) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#C9D6CC" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={52} />
        <Tooltip formatter={(v) => (Array.isArray(v) ? `${t(v[0])}–${t(v[1])} t` : `${t(v)} t`)} />
        <Area dataKey="band" name="Likely range" fill="#0F2B2E" fillOpacity={0.08} stroke="none" />
        <Line dataKey="total" name="Do nothing" stroke="#0F2B2E" strokeWidth={2.5} dot={false} />
        <Line dataKey="target" name="1.5 °C pathway" stroke="#2E8B57" strokeDasharray="6 5" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function CeoDashboard() {
  const { analysis, profile, cleanProfile, cleanInputs, settings, hasData } = useStore();
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dl, setDl] = useState('');
  const [combined, setCombined] = useState(null);

  const savingIds = (analysis?.mac_curve || []).filter((m) => m.abatement_tco2e > 0 && (m.mac_inr_per_tco2e ?? 1) <= 0).map((m) => m.id).join(',');
  useEffect(() => {
    if (!savingIds) return;
    const sw = Object.fromEntries(savingIds.split(',').map((id) => [id, 1]));
    simulateSwitches(cleanProfile, cleanInputs, sw).then(setCombined).catch(() => setCombined(null));
  }, [savingIds, cleanProfile, cleanInputs]);

  if (!hasData || !analysis) return <><Head name={profile.name} /><NeedData /></>;

  const a = analysis;
  const moves = a.mac_curve.filter((m) => m.abatement_tco2e > 0);
  const savingMoves = moves.filter((m) => (m.mac_inr_per_tco2e ?? 1) <= 0);
  const top3 = [...savingMoves].sort((x, y) => y.abatement_tco2e - x.abatement_tco2e).slice(0, 3);
  if (top3.length < 3) top3.push(...moves.filter((m) => !top3.includes(m)).slice(0, 3 - top3.length));

  const runBrief = async () => {
    if (settings.engine === 'browser-lmstudio') { setErr('Briefings run on the server. Pick a server-side engine, or ask agents one by one on the AI agents page.'); return; }
    setBusy(true); setErr('');
    try { setBrief((await getInsights(cleanProfile, cleanInputs, settings.engine)).briefings); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const pdf = async () => {
    setDl('Preparing PDF…');
    try { await downloadReport('pdf', { profile: cleanProfile, inputs: cleanInputs, audience: 'ceo' }, settings.engine === 'browser-lmstudio' ? 'nugen' : settings.engine); setDl(''); } catch (e) { setDl(`Couldn't create the PDF: ${e.message}`); }
  };

  return (
    <>
      <Head name={profile.name} onPdf={pdf} dl={dl} />
      <div className="grid g4">
        <div className="panel hero-kpi kpi">
          <span className="l">Footprint this year</span>
          <span className="v">{t(a.total_tco2e)} t</span>
          <span className="d">80% range {t(a.uncertainty.p10, 0)}–{t(a.uncertainty.p90, 0)} t</span>
        </div>
        <div className="panel kpi">
          <span className="l">Gap to 1.5 °C path in 2030</span>
          <span className="v" style={{ color: a.target.gap_2030 > 0 ? 'var(--warn)' : 'var(--leaf-deep)' }}>{a.target.gap_2030 > 0 ? `${t(a.target.gap_2030)} t` : 'On track'}</span>
          <Why>{a.target.justification}</Why>
        </div>
        <div className="panel kpi">
          <span className="l">Savings available from cuts that pay back</span>
          <span className="v">{combined ? inr(combined.total_annual_saving_inr) : '–'}<small style={{ fontSize: 16 }}>/yr</small></span>
          <span className="d">{combined ? `and −${t(combined.total_abatement_tco2e)} t a year` : ''}</span>
          <Why>All {savingMoves.length} switches that cost nothing or less per tonne, applied together at full rollout so overlaps (for example solar and a green PPA both covering electricity) are not double-counted.</Why>
        </div>
        <div className="panel kpi">
          <span className="l">Decarbonisation readiness</span>
          <span className="v">{a.readiness.score}<small style={{ fontSize: 16 }}>/100</small></span>
          <Why>{a.readiness.justification} Data {a.readiness.components.data_completeness}, Scope 3 {a.readiness.components.scope3_coverage}, peers {a.readiness.components.peer_position}, renewables {a.readiness.components.renewable_share}.</Why>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', marginTop: 16 }}>
        <div className="panel">
          <h2>Where you're heading</h2>
          <p className="sub">If nothing changes, versus a 1.5 °C-aligned path (4.2% less every year).</p>
          <ForecastChart analysis={a} />
        </div>
        <div className="panel">
          <h2>Decisions for this quarter</h2>
          <p className="sub">The biggest cuts that pay for themselves, each at full rollout.</p>
          {top3.map((m) => (
            <div className="flag" key={m.id}>
              <span className="dot" style={{ background: SCOPE_HEX[m.scope], marginTop: 6 }} />
              <div>
                <strong>{m.name}</strong>
                <div className="small muted">−{t(m.abatement_tco2e)} t a year, capex {inr(m.capex_inr)}, saves {inr(m.annual_saving_inr)}/yr{m.payback_years ? `, ${m.payback_years} yr payback` : ''}</div>
                <Why label="Why this move?">{m.justification}</Why>
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 10 }}><Link to="/app/scenarios" className="btn btn-ink btn-sm">Compare in scenarios</Link><Link to="/app/climate-tech" className="btn btn-ghost btn-sm">Try the switches</Link></div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>Where the carbon comes from</h2>
          <div style={{ margin: '10px 0 14px' }}><ScopeBar scopes={a.scope_totals} total={a.total_tco2e} /></div>
          <table className="data">
            <thead><tr><th>Source</th><th className="num">tCO₂e</th><th className="num">Share</th><th className="num">A 10% cut saves</th></tr></thead>
            <tbody>{a.drivers.map((d) => (
              <tr key={d.category}><td><span className="dot" style={{ background: SCOPE_HEX[d.scope] }} />{d.label}</td><td className="num">{t(d.tco2e)}</td><td className="num">{d.share}%</td><td className="num">{inr(d.cut10_saving_inr)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Risk and compliance watch-list</h2>
          <div className="flag"><span className="tag">BRSR Core</span><span>Large listed customers must report Scope 1 and 2 with assurance and are asking suppliers for the same data.</span></div>
          <div className="flag"><span className="tag">CCTS</span><span>India's carbon market sets intensity targets for notified sectors. Excess emissions will carry a price.</span></div>
          <div className="flag"><span className="tag">EU CBAM</span><span>If you export steel, aluminium, cement or fertiliser to the EU, embedded emissions must be reported.</span></div>
          <div className="flag"><span className="tag">Peers</span><span>{a.benchmark ? `${a.benchmark.per_employee} t per employee, ${a.benchmark.percentile}th percentile for ${a.benchmark.industry} (${a.benchmark.verdict}).` : 'Add your headcount to benchmark against peers.'}</span></div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="row">
          <div><h2>Briefing from the scope agents</h2><p className="sub" style={{ margin: 0 }}>Ignis, Volt and Atlas each review their scope, then Sage summarises for you.</p></div>
          <span className="spacer" />
          <button type="button" className="btn btn-ink btn-sm" onClick={runBrief} disabled={busy}>{busy ? 'Agents are reviewing…' : brief ? 'Run again' : 'Get the briefing'}</button>
        </div>
        {err && <div className="banner" style={{ marginTop: 12 }}>{err}</div>}
        {brief && (
          <div className="grid g2" style={{ marginTop: 14 }}>
            {brief.map((b) => (
              <div key={b.agent} className="msg bot" style={{ maxWidth: 'none' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{b.name}</strong>
                <Markdown text={b.reply} />
                <ModelBadge meta={b.meta} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Head({ name, onPdf, dl }) {
  return (
    <div className="page-head">
      <div><h1>{name || 'Your company'}: CEO view</h1><p>Decisions, money and risk. Every number has a "why" underneath it.</p></div>
      {onPdf && <div className="row"><button type="button" className="btn btn-ink btn-sm" onClick={onPdf}>Download board brief (PDF)</button>{dl && <span className="small">{dl}</span>}</div>}
    </div>
  );
}
