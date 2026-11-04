import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../services/api';

const Ctx = createContext(null);

const EMPTY_PROFILE = {
  name: '', industry: 'manufacturing', employees: '', location: '', revenue_cr: '',
  renewable_share: 0, growth_rate: '', period: 'annual', goals: '', priorities: [],
  budget: 'moderate', expertise: 'beginner', contact_name: '',
};
const EMPTY_INPUTS = { electricity: 0, natural_gas: 0, petrol: 0, diesel: 0, air_travel: 0, hotels: 0, commuting: 0, waste: 0 };

// eslint-disable-next-line react-refresh/only-export-components
export const SAMPLE = {
  profile: {
    ...EMPTY_PROFILE, name: 'Shakti Textiles', industry: 'manufacturing', employees: 120, location: 'Pune, Maharashtra',
    revenue_cr: 85, renewable_share: 10, goals: 'Net zero by 2040 and BRSR-ready supplier data for our export buyers',
    priorities: ['cost', 'compliance'], contact_name: 'Ananya',
  },
  inputs: { electricity: 850000, natural_gas: 42000, petrol: 6000, diesel: 18000, air_travel: 90000, hotels: 180, commuting: 310000, waste: 30000 },
};

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function StoreProvider({ children }) {
  const [profile, setProfile] = useState(() => load('cai.profile', EMPTY_PROFILE));
  const [inputs, setInputs] = useState(() => load('cai.inputs', EMPTY_INPUTS));
  const [settings, setSettings] = useState(() => load('cai.settings', { engine: 'nugen', localUrl: 'http://localhost:1234/v1', localModel: 'local-model' }));
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const reqId = useRef(0);

  useEffect(() => save('cai.profile', profile), [profile]);
  useEffect(() => save('cai.inputs', inputs), [inputs]);
  useEffect(() => save('cai.settings', settings), [settings]);

  const hasData = useMemo(() => Object.values(inputs).some((v) => +v > 0), [inputs]);
  const cleanProfile = useMemo(() => ({
    ...profile,
    employees: profile.employees === '' ? null : Number(profile.employees),
    revenue_cr: profile.revenue_cr === '' ? null : Number(profile.revenue_cr),
    growth_rate: profile.growth_rate === '' ? null : Number(profile.growth_rate),
    renewable_share: Number(profile.renewable_share) || 0,
  }), [profile]);
  const cleanInputs = useMemo(() => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Number(v) || 0])), [inputs]);

  const refresh = useCallback(async () => {
    if (!hasData) return;
    const id = ++reqId.current;
    setStatus('loading');
    try {
      const a = await analyze(cleanProfile, cleanInputs);
      if (id === reqId.current) { setAnalysis(a); setStatus('ready'); setError(''); }
    } catch (e) {
      if (id === reqId.current) { setStatus('error'); setError(e.message); }
    }
  }, [hasData, cleanProfile, cleanInputs]);

  useEffect(() => {
    const h = setTimeout(refresh, 450);
    return () => clearTimeout(h);
  }, [refresh]);

  const value = {
    profile, setProfile, inputs, setInputs, settings, setSettings,
    cleanProfile, cleanInputs, analysis, status, error, refresh, hasData,
    loadSample: () => { setProfile(SAMPLE.profile); setInputs(SAMPLE.inputs); },
    reset: () => { setProfile(EMPTY_PROFILE); setInputs(EMPTY_INPUTS); setAnalysis(null); setStatus('idle'); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(Ctx);
