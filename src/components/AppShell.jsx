import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, FileSpreadsheet, FileText, FlaskConical, Gauge, ClipboardList, Scale, ToggleRight } from 'lucide-react';
import { useStore } from '../state/store';
import { isAuthenticated, llmStatus, signIn, signOut } from '../services/api';

const LINKS = [
  { to: '/app/assess', label: 'Assessment', icon: ClipboardList },
  { group: 'Dashboards' },
  { to: '/app/ceo', label: 'CEO view', icon: Gauge },
  { to: '/app/stakeholder', label: 'Stakeholder view', icon: Scale },
  { group: 'Tools' },
  { to: '/app/agents', label: 'AI agents', icon: Bot },
  { to: '/app/scenarios', label: 'Scenarios', icon: FlaskConical },
  { to: '/app/climate-tech', label: 'Climate-tech switch', icon: ToggleRight },
  { to: '/app/documents', label: 'Documents', icon: FileSpreadsheet },
  { to: '/app/reports', label: 'Reports', icon: FileText },
];

function SignIn({ onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await signIn(email.trim(), pw); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ fontSize: 28 }}>Sign in to save assessments</h2>
        <p className="muted small">Everything else works without an account.</p>
        <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        {err && <div className="banner">{err}</div>}
        <div className="row"><button className="btn btn-ink" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  );
}

export default function AppShell() {
  const { settings, setSettings, status, error, profile, analysis } = useStore();
  const loc = useLocation();
  const [llm, setLlm] = useState(null);
  const [authed, setAuthed] = useState(isAuthenticated());
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => { llmStatus().then(setLlm).catch(() => setLlm(null)); }, []);
  const engineLabel = settings.engine === 'nugen'
    ? (llm?.nugen?.configured ? 'Nugen aligned model' : 'Nugen not connected')
    : settings.engine === 'browser-lmstudio' ? 'LM Studio (this computer)' : settings.engine === 'lmstudio' ? 'LM Studio (server)' : 'Ollama (server)';
  const engineOk = settings.engine !== 'nugen' || llm?.nugen?.configured;

  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="brand"><span className="brand-mark" />CarbonAI</Link>
        {LINKS.map((l, i) => l.group
          ? <div className="group" key={i}>{l.group}</div>
          : <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><l.icon size={17} />{l.label}</NavLink>)}
        <div className="foot">
          <label htmlFor="engine">AI engine</label>
          <select id="engine" className="select" style={{ color: 'var(--ink)' }} value={settings.engine} onChange={(e) => setSettings({ ...settings, engine: e.target.value })}>
            <option value="nugen">Nugen aligned model (cloud)</option>
            <option value="browser-lmstudio">LM Studio on this computer</option>
            <option value="lmstudio">LM Studio next to the server</option>
            <option value="ollama">Ollama next to the server</option>
          </select>
          {settings.engine === 'browser-lmstudio' && (
            <>
              <input className="input" style={{ color: 'var(--ink)' }} aria-label="LM Studio URL" value={settings.localUrl} onChange={(e) => setSettings({ ...settings, localUrl: e.target.value })} />
              <input className="input" style={{ color: 'var(--ink)' }} aria-label="LM Studio model id" value={settings.localModel} onChange={(e) => setSettings({ ...settings, localModel: e.target.value })} />
              <span>In LM Studio, start the server and turn on CORS.</span>
            </>
          )}
          {settings.engine === 'nugen' && llm && (
            <span>{llm.nugen.configured ? `Model ${llm.nugen.model_id}` : 'Nugen key not set on the server yet; answers come from the analytics engine.'}</span>
          )}
          {authed
            ? <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--paper-2)' }} onClick={() => { signOut(); setAuthed(false); }}>Sign out</button>
            : <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--paper-2)' }} onClick={() => setShowSignIn(true)}>Sign in</button>}
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="company-chip">
            <span className="cc-mark">{(profile.name || 'C')[0].toUpperCase()}</span>
            <div><b>{profile.name || 'No company yet'}</b><small>{profile.industry || 'general'}{profile.location ? `, ${profile.location}` : ''}</small></div>
          </div>
          <span className="spacer" />
          {analysis && <span className="pill">{analysis.total_tco2e.toLocaleString('en-IN', { maximumFractionDigits: 0 })} tCO₂e</span>}
          {status === 'loading' && <span className="pill"><span className="loading-dot" /> Updating</span>}
          <span className={`pill ${engineOk ? 'ok' : 'warn'}`}><i />{engineLabel}</span>
        </div>
        {status === 'error' && <div className="banner">Couldn't reach the CarbonAI server ({error}). The free server can take up to a minute to wake up, so try again shortly.</div>}
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      {showSignIn && <SignIn onClose={() => setShowSignIn(false)} onDone={() => { setAuthed(true); setShowSignIn(false); }} />}
    </div>
  );
}
