import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { FIELDS, t } from '../lib/format';
import { Markdown, ModelBadge, Why } from '../components/Bits';
import { downloadTemplate, uploadDocuments } from '../services/api';

export default function Documents() {
  const { inputs, setInputs, profile, setProfile, settings } = useStore();
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('replace');
  const fileRef = useRef(null);
  const nav = useNavigate();

  const go = async (files) => {
    if (!files?.length) return;
    setBusy(true); setErr('');
    try { setRes(await uploadDocuments(files, settings.engine === 'browser-lmstudio' ? 'nugen' : settings.engine)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const apply = () => {
    const s = res.suggested_inputs;
    const next = { ...inputs };
    Object.entries(s).forEach(([k, v]) => { next[k] = mode === 'add' ? (Number(next[k]) || 0) + v : v; });
    setInputs(next);
    const hint = res.profile_hint || {};
    const p = { ...profile };
    Object.entries(hint).forEach(([k, v]) => { if (!p[k]) p[k] = v; });
    setProfile(p);
    nav('/app/assess');
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Documents</h1><p>Drop in electricity bills, fuel logs, travel reports or waste manifests. Archivist sorts them by type and pulls out the numbers, showing the line each one came from.</p></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadTemplate()}>Download Excel template</button>
      </div>
      {err && <div className="banner">{err}</div>}

      <div
        className={`drop ${over ? 'over' : ''}`}
        role="button" tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); go(e.dataTransfer.files); }}
      >
        <input ref={fileRef} type="file" multiple hidden accept=".pdf,.xlsx,.xlsm,.csv,.txt,.docx" onChange={(e) => go(e.target.files)} />
        <h2 style={{ fontSize: 24 }}>{busy ? 'Reading your documents…' : 'Drop files here, or click to choose'}</h2>
        <p className="muted">PDF, Excel, CSV, Word or text. Up to 15 files, 10 MB each.</p>
      </div>

      {res && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', marginTop: 16 }}>
          <div className="panel">
            <h2>Sorted into {Object.keys(res.groups).length} group{Object.keys(res.groups).length === 1 ? '' : 's'}</h2>
            {res.documents.map((d) => (
              <div className="flag" key={d.filename}>
                <span className="tag">{d.label}</span>
                <div>
                  <strong>{d.filename}</strong>
                  {d.error && <p className="warn-text">{d.error}</p>}
                  {d.extracted && Object.keys(d.extracted).length === 0 && <p className="small muted">No quantities found. Check that the file has text and units, such as kWh or litres.</p>}
                  {d.extracted && Object.entries(d.extracted).map(([k, v]) => (
                    <div className="small" key={k}>{FIELDS.find((f) => f.key === k)?.label}: <strong>{t(v.value, 0)} {res.units[k]}</strong>
                      <Why label="Where did this come from?">"{v.evidence}"</Why></div>
                  ))}
                  {d.confidence != null && <p className="small muted">Confidence {Math.round(d.confidence * 100)}%{d.matched?.length ? `, matched: ${d.matched.join(', ')}` : ''}</p>}
                </div>
              </div>
            ))}
            <Why label="How does sorting work?">{res.justification}</Why>
          </div>
          <div className="grid" style={{ alignContent: 'start' }}>
            <div className="panel">
              <h2>Archivist's notes</h2>
              <div className="msg bot" style={{ maxWidth: 'none' }}><Markdown text={res.agent_note} /><ModelBadge meta={res.meta} /></div>
            </div>
            <div className="panel">
              <h2>Values found</h2>
              <table className="data"><tbody>
                {Object.entries(res.suggested_inputs).map(([k, v]) => <tr key={k}><td>{FIELDS.find((f) => f.key === k)?.label}</td><td className="num">{t(v, 0)} {res.units[k]}</td></tr>)}
              </tbody></table>
              <div className="chips" style={{ margin: '12px 0' }}>
                <button type="button" className="chip" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>Replace current values</button>
                <button type="button" className="chip" aria-pressed={mode === 'add'} onClick={() => setMode('add')}>Add to current values</button>
              </div>
              <button type="button" className="btn btn-ink" disabled={!Object.keys(res.suggested_inputs).length} onClick={apply}>Use these values in my assessment</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
