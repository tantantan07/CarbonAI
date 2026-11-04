import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Markdown, ModelBadge, Why } from '../components/Bits';
import { agentChat, listAgents } from '../services/api';
import { NeedData } from './CeoDashboard';

const FALLBACK = [
  { id: 'terra', name: 'Terra', title: 'Your sustainability guide', color: '#91e5aa', tagline: 'Explains your footprint in plain words.' },
  { id: 'ignis', name: 'Ignis', title: 'Scope 1 specialist — fuels & fleet', color: '#ff9b6b', tagline: 'Diesel, petrol, gas, DG sets.' },
  { id: 'volt', name: 'Volt', title: 'Scope 2 specialist — electricity', color: '#ffd166', tagline: 'Grid, open access, solar, RECs.' },
  { id: 'atlas', name: 'Atlas', title: 'Scope 3 specialist — value chain', color: '#7cc6fe', tagline: 'Travel, commuting, waste.' },
  { id: 'sage', name: 'Sage', title: 'CEO strategy advisor', color: '#c9a7ff', tagline: 'Cost, risk, compliance, ROI.' },
  { id: 'lex', name: 'Lex', title: 'Assurance & disclosure analyst', color: '#e6e6e6', tagline: 'Method and sources.' },
];

const SUGGEST = {
  terra: ['What does my footprint actually mean?', 'What is Scope 3, simply?', 'What should I do first?'],
  ignis: ['Should we move the fleet to EVs?', 'How do we cut DG set diesel?', 'Is a heat pump worth it for us?'],
  volt: ['Can we use green open access?', 'How big a rooftop solar system do we need?', 'Do RECs count?'],
  atlas: ['How do we cut flight emissions?', 'How do I measure commuting?', 'What about supplier emissions?'],
  sage: ['What should I tell the board?', 'What is our BRSR exposure?', 'Which investment pays back fastest?'],
  lex: ['What would an auditor check first?', 'How reliable is this number?', 'What data are we missing?'],
};

export default function Agents() {
  const { cleanProfile, cleanInputs, settings, hasData, profile } = useStore();
  const [agents, setAgents] = useState(FALLBACK);
  const [active, setActive] = useState('terra');
  const [threads, setThreads] = useState({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => { listAgents().then((a) => setAgents(a.filter((x) => x.id !== 'archivist'))).catch(() => {}); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [threads, active, busy]);

  if (!hasData) return <><div className="page-head"><div><h1>AI agents</h1></div></div><NeedData /></>;

  const ag = agents.find((a) => a.id === active) || agents[0];
  const msgs = threads[active] || [];

  const send = async (text) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user', content: q }];
    setThreads({ ...threads, [active]: next });
    setDraft('');
    setBusy(true);
    try {
      const r = await agentChat(active, cleanProfile, cleanInputs, next.map(({ role, content }) => ({ role, content })), settings.engine, { url: settings.localUrl, model: settings.localModel });
      setThreads((th) => ({ ...th, [active]: [...next, { role: 'assistant', content: r.reply, meta: r.meta, grounding: r.grounding }] }));
    } catch (e) {
      setThreads((th) => ({ ...th, [active]: [...next, { role: 'assistant', content: `I couldn't answer: ${e.message}`, error: true }] }));
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>AI agents</h1><p>Each agent knows {profile.name || 'your company'}, sees only its own part of the footprint, and always says why.</p></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
        <div className="panel agent-pick" role="tablist" aria-label="Agents">
          {agents.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={a.id === active} className={`agent-btn ${a.id === active ? 'on' : ''}`} onClick={() => setActive(a.id)}>
              <span className="face" style={{ background: a.color }}>{a.name[0]}</span>
              <span><strong>{a.name}</strong><small>{a.title}</small></span>
            </button>
          ))}
        </div>
        <div className="panel chat">
          <div className="row" style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
            <span className="agent-face" style={{ width: 44, height: 44, fontSize: 20, background: ag.color }}>{ag.name[0]}</span>
            <div><h2 style={{ margin: 0 }}>{ag.name}</h2><span className="small muted">{ag.tagline}</span></div>
          </div>
          <div className="chat-log" ref={logRef} aria-live="polite">
            {msgs.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Ask {ag.name} anything about {profile.name || 'your company'}'s footprint, or pick a question below.</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                {m.role === 'user' ? m.content : <Markdown text={m.content} />}
                {m.meta && <ModelBadge meta={m.meta} />}
                {m.grounding && <Why label="What data did this use?"><pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{m.grounding}</pre></Why>}
              </div>
            ))}
            {busy && <div className="msg bot"><span className="loading-dot" /> {ag.name} is thinking…</div>}
          </div>
          <div className="suggest">{(SUGGEST[active] || []).map((s) => <button type="button" key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input className="input" aria-label={`Message ${ag.name}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ask ${ag.name}…`} />
            <button className="btn btn-ink" disabled={busy || !draft.trim()}>Send</button>
          </form>
        </div>
      </div>
    </>
  );
}
