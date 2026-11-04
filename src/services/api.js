import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://carbonai-backend.onrender.com';

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 90000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const errMsg = (e) =>
  e?.response?.data?.detail?.toString?.() || e?.message || 'Request failed';

// ---------------- auth (Round 1, Supabase via backend) ----------------
export async function signIn(email, password) {
  try {
    const { data } = await api.post('/auth/signin', { email, password });
    const token = data?.session?.access_token;
    if (!token) throw new Error('No access token returned.');
    localStorage.setItem('access_token', token);
    if (data?.user) localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  } catch (e) {
    throw new Error(errMsg(e), { cause: e });
  }
}
export const signOut = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
};
export const isAuthenticated = () => Boolean(localStorage.getItem('access_token'));

// Saves to Supabase (flat payload the backend expects)
export async function saveAssessment(profile, inputs) {
  const { data } = await api.post('/assessment', {
    company_name: profile.name || 'My company',
    industry: profile.industry || 'general',
    employee_count: Number(profile.employees) || null,
    location: profile.location || null,
    ...inputs,
  });
  return data;
}

// ---------------- v2 ----------------
const engineHeaders = (engine) =>
  engine && engine !== 'nugen' && engine !== 'browser-lmstudio'
    ? { 'X-LLM-Provider': engine }
    : {};

export const llmStatus = () => api.get('/v2/llm/status').then((r) => r.data);
export const listAgents = () => api.get('/v2/agents').then((r) => r.data);
export const listClimateTech = () => api.get('/v2/climate-tech').then((r) => r.data);
export const analyze = (profile, inputs) =>
  api.post('/v2/analyze', { profile, inputs }).then((r) => r.data);
export const simulateSwitches = (profile, inputs, switches) =>
  api.post('/v2/climate-tech/simulate', { profile, inputs, switches }).then((r) => r.data);
export const runScenarios = (profile, inputs, scenarios) =>
  api.post('/v2/scenarios', { profile, inputs, scenarios }).then((r) => r.data);
export const getInsights = (profile, inputs, engine) =>
  api.post('/v2/insights', { profile, inputs }, { headers: engineHeaders(engine) }).then((r) => r.data);

export async function agentChat(agentId, profile, inputs, messages, engine, localCfg) {
  if (engine === 'browser-lmstudio') {
    // Prompt is personalised on the server, inference runs on this computer.
    const { data } = await api.post(`/v2/agents/${agentId}/prompt`, { profile, inputs, messages });
    const base = (localCfg?.url || 'http://localhost:1234/v1').replace(/\/$/, '');
    const started = performance.now();
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: localCfg?.model || 'local-model', messages: data.messages, temperature: 0.3, max_tokens: 900 }),
    });
    if (!res.ok) throw new Error(`LM Studio returned ${res.status}. Is the local server running with CORS enabled?`);
    const out = await res.json();
    let text = out?.choices?.[0]?.message?.content || '';
    if (text.includes('</think>')) text = text.split('</think>')[1];
    return {
      reply: text.trim(),
      meta: { provider: 'lmstudio (this computer)', model: out.model, latency_ms: Math.round(performance.now() - started) },
    };
  }
  const { data } = await api.post(`/v2/agents/${agentId}/chat`, { profile, inputs, messages }, { headers: engineHeaders(engine) });
  return data;
}

export async function uploadDocuments(files, engine) {
  const fd = new FormData();
  [...files].forEach((f) => fd.append('files', f));
  const { data } = await api.post('/v2/documents/upload', fd, { headers: engineHeaders(engine) });
  return data;
}

export async function downloadReport(fmt, body, engine) {
  const res = await api.post(`/v2/reports/${fmt}`, body, { responseType: 'blob', headers: engineHeaders(engine) });
  const name = (res.headers['content-disposition'] || '').match(/filename="(.+)"/)?.[1] || `carbonai-report.${fmt}`;
  saveBlob(res.data, name);
}

export async function downloadTemplate() {
  const res = await api.get('/v2/documents/template', { responseType: 'blob' });
  saveBlob(res.data, 'carbonai-data-template.xlsx');
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
