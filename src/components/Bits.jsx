import { SCOPE_HEX } from '../lib/format';

export function Why({ children, label = 'Why this number?' }) {
  if (!children) return null;
  return (
    <details className="why">
      <summary>{label}</summary>
      <div>{children}</div>
    </details>
  );
}

export function ScopeBar({ scopes, total }) {
  if (!total) return null;
  return (
    <div className="scopebar" role="img" aria-label={`Scope 1 ${scopes.scope1} t, Scope 2 ${scopes.scope2} t, Scope 3 ${scopes.scope3} t`}>
      {[1, 2, 3].map((s) => (
        <span key={s} style={{ width: `${(scopes[`scope${s}`] / total) * 100}%`, background: SCOPE_HEX[s] }} />
      ))}
    </div>
  );
}

function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

export function Markdown({ text }) {
  const blocks = String(text || '').split(/\n+/).filter((l) => l.trim());
  const out = [];
  let list = [];
  const flush = () => { if (list.length) { out.push(<ul key={`u${out.length}`}>{list}</ul>); list = []; } };
  blocks.forEach((l, i) => {
    const t = l.trim();
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
      list.push(<li key={i}>{inline(t.replace(/^([-*•]|\d+[.)])\s+/, ''))}</li>);
    } else {
      flush();
      const h = t.replace(/^#+\s*/, '');
      out.push(<p key={i}>{inline(h)}</p>);
    }
  });
  flush();
  return <>{out}</>;
}

export function ModelBadge({ meta }) {
  if (!meta) return null;
  const off = meta.provider === 'offline-rules';
  return (
    <div className="meta">
      {off ? 'Analytics engine (AI model unreachable)' : `${meta.provider}, ${meta.model}`}
      {meta.latency_ms ? `, ${(meta.latency_ms / 1000).toFixed(1)} s` : ''}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="panel"><p className="muted">{children}</p></div>;
}
