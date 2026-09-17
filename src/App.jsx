import React, { useState } from 'react';

import {
  submitAssessment,
  signIn,
  signOut,
} from './services/api';

import Dashboard from './pages/Dashboard';
import carbonAIImage from './assets/carbon-ai.png';
import './App.css';

const emissionFields = [
  { key: 'electricity', label: 'Electricity consumption', unit: 'kWh / year', placeholder: 'e.g. 10000', category: '⚡ Energy' },
  { key: 'naturalGas', label: 'Natural gas', unit: 'm³ / year', placeholder: 'e.g. 5000', category: '⚡ Energy' },
  { key: 'petrol', label: 'Petrol', unit: 'litres / year', placeholder: 'e.g. 2500', category: '⛽ Fuel' },
  { key: 'diesel', label: 'Diesel', unit: 'litres / year', placeholder: 'e.g. 3000', category: '⛽ Fuel' },
  { key: 'flights', label: 'Air travel', unit: 'km / year', placeholder: 'e.g. 50000', category: '✈️ Business travel' },
  { key: 'hotels', label: 'Hotel stays', unit: 'nights / year', placeholder: 'e.g. 500', category: '✈️ Business travel' },
  { key: 'commuting', label: 'Employee commuting', unit: 'km / year', placeholder: 'e.g. 120000', category: '🚗 Commuting & Waste' },
  { key: 'waste', label: 'Waste generated', unit: 'kg / year', placeholder: 'e.g. 5000', category: '🚗 Commuting & Waste' },
];

const initialCompany = { name: '', industry: '', employees: '', location: '' };
const initialEmissions = {
  electricity: '', naturalGas: '', petrol: '', diesel: '', flights: '', hotels: '', commuting: '', waste: '',
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(localStorage.getItem('access_token')));
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState('');

  const [activeTab, setActiveTab] = useState('landing');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState(initialCompany);
  const [emissions, setEmissions] = useState(initialEmissions);
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [assessmentResult, setAssessmentResult] = useState(null);

  const updateCompany = (field, value) => {
    setCompany((prev) => ({ ...prev, [field]: value }));
  };

  const updateEmissions = (field, value) => {
    setEmissions((prev) => ({ ...prev, [field]: value }));
  };

  const restartAssessment = () => {
    setCompany({ ...initialCompany });
    setEmissions({ ...initialEmissions });
    setAiRecommendation('');
    setAssessmentResult(null);
    setLoading(false);
    setActiveTab('landing');
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToLandingSection = (sectionId) => {
    setStep(1);
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) element.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const openSignIn = () => {
    setSignInError(''); setSignInEmail(''); setSignInPassword(''); setShowSignIn(true);
  };
  const closeSignIn = () => {
    if (signInLoading) return;
    setShowSignIn(false); setSignInError('');
  };
  const handleGetStarted = () => {
    if (!isLoggedIn) { openSignIn(); return; }
    setActiveTab('landing'); setStep(2);
  };
  const handleSignIn = async (event) => {
    event.preventDefault(); setSignInError('');
    const email = signInEmail.trim(); const password = signInPassword;
    if (!email || !password) { setSignInError('Please enter your email and password.'); return; }
    setSignInLoading(true);
    try {
      await signIn(email, password); setIsLoggedIn(true); setShowSignIn(false); setSignInEmail(''); setSignInPassword(''); setActiveTab('landing'); setStep(2);
    } catch (error) {
      console.error('Sign in error:', error); setSignInError(error?.message || 'Sign in failed. Please check your email and password.');
    } finally { setSignInLoading(false); }
  };
  const handleDashboardAccess = () => {
    if (!isLoggedIn) { openSignIn(); return; }
    setActiveTab('dashboard');
  };
  const handleLogout = () => {
    signOut(); setIsLoggedIn(false); setActiveTab('landing'); setStep(1);
    setCompany({ ...initialCompany }); setEmissions({ ...initialEmissions }); setAiRecommendation(''); setAssessmentResult(null);
  };
  const handleCalculate = async () => {
    if (!isLoggedIn) { openSignIn(); return; }
    setLoading(true);
    const payload = {
      company_name: company.name, industry: company.industry || 'general', employee_count: company.employees ? parseInt(company.employees, 10) : null,
      location: company.location || null, electricity: parseFloat(emissions.electricity) || 0, natural_gas: parseFloat(emissions.naturalGas) || 0,
      petrol: parseFloat(emissions.petrol) || 0, diesel: parseFloat(emissions.diesel) || 0, air_travel: parseFloat(emissions.flights) || 0,
      hotels: parseFloat(emissions.hotels) || 0, commuting: parseFloat(emissions.commuting) || 0, waste: parseFloat(emissions.waste) || 0,
    };
    try {
      const response = await submitAssessment(payload); setAssessmentResult(response); setAiRecommendation(response?.recommendation || response?.aiRecommendation || ''); setStep(4);
    } catch (error) {
      console.error('Calculation failed:', error); alert(error?.response?.data?.detail || error?.message || 'Calculation failed. Please check your information and try again.');
    } finally { setLoading(false); }
  };

  const totalTco2e = Number(assessmentResult?.total_tco2e ?? 0);
  const breakdownPct = assessmentResult?.breakdown_pct || {};
  const energyPct = Number(breakdownPct.energy ?? 0);
  const transportPct = Number(breakdownPct.transport ?? 0);
  const wastePct = Number(breakdownPct.waste ?? 0);
  const largestSource = Object.entries({ Energy: energyPct, Transport: transportPct, Waste: wastePct }).reduce((max, item) => (item[1] > max[1] ? item : max), ['Energy', 0]);

  return (
    <div className="app">
      <nav className="carbonai-navbar">
        <button type="button" className="carbonai-logo" onClick={() => { setActiveTab('landing'); goToLandingSection('home'); }}><span className="logo-mark">◈</span>Carbon<span>AI</span></button>
        <div className="carbonai-nav-links">
          {['how', 'features', 'impact', 'about'].map((section, index) => { const labels = ['How it works', 'Features', 'Impact', 'About']; return <button key={section} type="button" onClick={() => { setActiveTab('landing'); goToLandingSection(section); }}>{labels[index]}</button>; })}
          <button type="button" onClick={handleDashboardAccess} className={`carbonai-nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}>Dashboard</button>
          {!isLoggedIn ? <button type="button" className="carbonai-signin" onClick={openSignIn}>Sign in <span>→</span></button> : <button type="button" className="carbonai-signin" onClick={handleLogout}>Sign out <span>→</span></button>}
        </div>
      </nav>

      {activeTab === 'dashboard' ? (
        <Dashboard onRestart={restartAssessment} />
      ) : (
        <>
          {step === 1 && (
            <main className="carbonai-landing">
              <section className="carbonai-hero" id="home"><div className="carbonai-hero-glow" /><div className="carbonai-hero-text"><div className="carbonai-eyebrow">A CLEANER TOMORROW, POWERED BY AI</div><h1>Measure today.<br /><em>A greener</em><br />tomorrow.</h1><p>CarbonAI helps businesses understand their carbon footprint, identify emission hotspots, and discover smarter AI-driven ways to reduce their environmental impact.</p><div className="carbonai-hero-buttons"><button type="button" className="carbonai-primary" onClick={handleGetStarted}>Get started <span>→</span></button></div><div className="carbonai-stats"><div><strong>500+</strong><span>Businesses onboarded</span></div><div><strong>2.8M</strong><span>tCO₂e analysed</span></div><div><strong>28%</strong><span>Average reduction potential</span></div></div></div><div className="carbonai-visual"><div className="carbonai-image-glow" /><div className="carbonai-image-wrap"><img src={carbonAIImage} alt="CarbonAI sustainable future" className="carbonai-image" /></div></div></section>
              <section className="carbonai-trust"><p>TRUSTED BY FORWARD-THINKING COMPANIES</p><div className="carbonai-trust-logos"><span>Google</span><span>Microsoft</span><span>TATA</span><span>Infosys</span><span>Reliance</span></div></section>
              <section className="carbonai-how" id="how"><div className="carbonai-label">HOW IT WORKS</div><h2>From data to <em>real impact.</em></h2><p className="carbonai-description">A simple process. A significant difference. Turn your business data into a cleaner, greener future.</p><div className="carbonai-process">{[['01','◫','Measure','Input your business activity data across key emission sources.'],['02','◌','Understand','Identify your biggest emission hotspots with AI-powered analysis.'],['03','◇','Take action','Get tailored recommendations to reduce your carbon footprint.']].map(([number,icon,title,description],index)=><React.Fragment key={number}><div className="carbonai-process-card"><span className="carbonai-process-number">{number}</span><div className="carbonai-process-icon">{icon}</div><h3>{title}</h3><p>{description}</p></div>{index<2&&<div className="carbonai-process-arrow">→</div>}</React.Fragment>)}</div></section>
              <section className="carbonai-features" id="features"><div className="carbonai-label">CARBONAI PLATFORM</div><h2>Intelligence for a<br /><em>greener business.</em></h2><div className="carbonai-features-grid">{[['◈','Carbon Intelligence','Transform complex environmental data into clear insights for your business.'],['◌','Emission Hotspots','Quickly discover which activities are responsible for the largest share of emissions.'],['✦','AI Recommendations','Receive practical strategies focused on the reductions that matter most.'],['↗','Impact Tracking','Track your progress and understand how sustainability decisions change your footprint.']].map(([icon,title,description],index)=><div className="carbonai-feature-card" key={title}><div className="carbonai-feature-icon">{icon}</div><h3>{title}</h3><p>{description}</p><span className="carbonai-feature-number">0{index+1}</span></div>)}</div></section>
              <section className="carbonai-impact" id="impact"><div><div className="carbonai-label">THE CARBONAI DIFFERENCE</div><h2>Better data.<br /><em>Better decisions.</em></h2></div><div className="carbonai-impact-stat"><strong>28%</strong><span>average reduction potential</span></div></section>
              <section className="carbonai-about" id="about"><div className="carbonai-about-card"><div className="carbonai-label">ABOUT CARBONAI</div><h2>Technology that helps<br />businesses <em>change.</em></h2><p>CarbonAI combines carbon accounting, data analysis and artificial intelligence to help organizations make smarter sustainability decisions.</p><button type="button" className="carbonai-primary" onClick={handleGetStarted}>Start your assessment <span>→</span></button></div></section>
            </main>
          )}

          {step === 2 && (
            <main className="setup-page"><section className="setup-section"><div className="setup-card"><div className="badge">✦ CARBONAI SETUP</div><h1>Let's understand<br />your <span>business.</span></h1><p className="setup-description">Tell us a little about your company. CarbonAI will use this information to create your personalized carbon assessment.</p><div className="form-grid">
            <div className="form-group"><label>Company name</label><input type="text" placeholder="e.g. Acme Technologies" value={company.name} onChange={(e)=>updateCompany('name',e.target.value)} required /></div>
            <div className="form-group"><label>Industry</label><select value={company.industry} onChange={(e)=>updateCompany('industry',e.target.value)}><option value="">Select industry</option><option>Technology</option><option>Manufacturing</option><option>Finance</option><option>Healthcare</option><option>Retail</option><option>Education</option><option>Other</option></select></div>
            <div className="form-group"><label>Number of employees</label><input type="number" min="1" placeholder="e.g. 250" value={company.employees} onChange={(e)=>updateCompany('employees',e.target.value)} /></div>
            <div className="form-group"><label>Location</label><input type="text" placeholder="e.g. Pune, India" value={company.location} onChange={(e)=>updateCompany('location',e.target.value)} /></div>
            </div><button type="button" className="carbonai-primary setup-next" onClick={()=>setStep(3)}>Continue to emissions <span>→</span></button></div></section></main>
          )}

          {step === 3 && (
            <main className="assessment-page"><section className="assessment-section"><div className="assessment-card"><div className="badge">✦ EMISSIONS DATA</div><h1>Measure your<br /><span>carbon footprint.</span></h1><p className="assessment-description">Enter your annual business activity data. Estimates are okay — CarbonAI will calculate the resulting footprint.</p><div className="emissions-grid">{emissionFields.map((field)=><div className="emission-group" key={field.key}><label>{field.label}</label><div className="input-with-unit"><input type="number" min="0" placeholder={field.placeholder} value={emissions[field.key]} onChange={(e)=>updateEmissions(field.key,e.target.value)} /><span>{field.unit}</span></div></div>)}</div><div className="assessment-actions"><button type="button" className="carbonai-secondary" onClick={()=>setStep(2)}>← Back</button><button type="button" className="carbonai-primary" onClick={handleCalculate} disabled={loading}>{loading?'Calculating...':'Calculate footprint'} <span>→</span></button></div></div></section></main>
          )}

          {step === 4 && assessmentResult && (
            <main className="results-page"><section className="results-section"><div className="results-card"><div className="badge">✦ YOUR CARBON REPORT</div><h1>Your footprint is<br /><span>{totalTco2e.toFixed(2)} tCO₂e</span></h1><p className="results-description">Here is a summary of your estimated annual carbon footprint based on the information you provided.</p><div className="results-grid"><div className="result-highlight"><span>Total annual emissions</span><strong>{totalTco2e.toFixed(2)} tCO₂e</strong></div><div className="result-highlight"><span>Largest source</span><strong>{largestSource[0]}</strong><small>{Number(largestSource[1]).toFixed(1)}% of emissions</small></div></div><div className="breakdown"><h2>Emission breakdown</h2><div className="breakdown-list"><div><span>Energy</span><strong>{energyPct.toFixed(1)}%</strong></div><div><span>Transport</span><strong>{transportPct.toFixed(1)}%</strong></div><div><span>Waste</span><strong>{wastePct.toFixed(1)}%</strong></div></div></div><div className="recommendation"><h2>AI recommendations</h2><p>{aiRecommendation || 'No recommendation available.'}</p></div><div className="results-actions"><button type="button" className="carbonai-primary" onClick={restartAssessment}>↻ Restart assessment</button><button type="button" className="carbonai-secondary" onClick={handleDashboardAccess}>View dashboard</button></div></div></section></main>
          )}
        </>
      )}

      {showSignIn && (
        <div className="signin-overlay" role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={closeSignIn}>
          <div className="signin-modal" onClick={(event)=>event.stopPropagation()}><button type="button" className="signin-close" onClick={closeSignIn}>×</button><div className="badge">✦ CARBONAI</div><h2 id="signin-title">Welcome back.</h2><p>Sign in to continue your carbon assessment.</p><form onSubmit={handleSignIn}><div className="form-group"><label>Email</label><input type="email" value={signInEmail} onChange={(e)=>setSignInEmail(e.target.value)} autoComplete="email" /></div><div className="form-group"><label>Password</label><input type="password" value={signInPassword} onChange={(e)=>setSignInPassword(e.target.value)} autoComplete="current-password" /></div>{signInError&&<div className="signin-error">{signInError}</div>}<button type="submit" className="carbonai-primary signin-submit" disabled={signInLoading}>{signInLoading?'Signing in...':'Sign in'} <span>→</span></button></form></div>
        </div>
      )}
    </div>
  );
}
