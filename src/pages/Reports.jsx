import { useState } from 'react';
import { useStore } from '../state/store';
import { downloadReport } from '../services/api';
import { NeedData } from './CeoDashboard';

const FORMATS = [
  ['pdf', 'PDF', 'To read, print or send'],
  ['xlsx', 'Excel', 'All data, charts and justifications in sheets'],
  ['json', 'JSON', 'For your own systems'],
];

export default function Reports() {
  const { cleanProfile, cleanInputs, settings, hasData } = useStore();
  const [aud, setAud] = useState('ceo');
  const [withScn, setWithScn] = useState(true);
  const [ai, setAi] = useState(true);
  const [msg, setMsg] = useState('');

  if (!hasData) return <><div className="page-head"><div><h1>Reports</h1></div></div><NeedData /></>;

  const make = async (fmt) => {
    setMsg(`Creating ${fmt.toUpperCase()}…${ai ? ' The AI summary can take a few seconds.' : ''}`);
    let scenarios = null;
    if (withScn) { try { scenarios = JSON.parse(localStorage.getItem('cai.scenarios')); } catch { scenarios = null; } }
    try {
      await downloadReport(fmt, { profile: cleanProfile, inputs: cleanInputs, audience: aud, include_ai: ai, scenarios: scenarios?.map((s) => ({ ...s, growth_rate: s.growth_rate === '' ? null : Number(s.growth_rate) })) },
        settings.engine === 'browser-lmstudio' ? 'nugen' : settings.engine);
      setMsg(`Downloaded the ${fmt.toUpperCase()}.`);
    } catch (e) { setMsg(`Couldn't create the report: ${e.message}`); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Reports</h1><p>One assessment, written for two different readers, in the format each one needs.</p></div></div>
      <div className="grid g2">
        <div className="panel grid">
          <h2>Who is it for?</h2>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={aud === 'ceo'} onClick={() => setAud('ceo')}>CEO and board</button>
            <button type="button" className="chip" aria-pressed={aud === 'stakeholder'} onClick={() => setAud('stakeholder')}>Investors, auditors, customers</button>
          </div>
          <p className="small muted">{aud === 'ceo'
            ? 'Executive brief: headline numbers, cheapest cuts with rupee impact, scenario winner and compliance watch-list. Summary written by Sage.'
            : 'Disclosure statement: method, every factor and its source, uncertainty, benchmark and data-quality flags. Statement written by Lex.'}</p>
          <label className="row small"><input type="checkbox" checked={withScn} onChange={(e) => setWithScn(e.target.checked)} /> Include my saved scenarios</label>
          <label className="row small"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Add an AI-written summary</label>
        </div>
        <div className="panel grid">
          <h2>Download</h2>
          {FORMATS.map(([f, l, d]) => (
            <div className="row" key={f}><button type="button" className="btn btn-ink btn-sm" style={{ width: 120 }} onClick={() => make(f)}>{l}</button><span className="small muted">{d}</span></div>
          ))}
          {msg && <p className="small">{msg}</p>}
        </div>
      </div>
    </>
  );
}
