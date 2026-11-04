import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import Lenis from 'lenis';
import heroImg from '../assets/carbon-ai.png';
import { useStore } from '../state/store';

// Sample company used for the scroll story (same numbers the engine produces for the demo).
const STORY = [
  { scope: 2, t: 617.95, title: 'A year of electricity bills', body: '8.5 lakh units from the grid. India\'s grid still runs mostly on coal, so every unit carries about 0.73 kg of CO₂.', at: [0.04, 0.28] },
  { scope: 1, t: 146.94, title: 'Diesel, petrol and gas burned on site', body: 'Trucks, DG sets and the boiler. This is the carbon you burn yourself, and it\'s the easiest to measure.', at: [0.3, 0.52] },
  { scope: 3, t: 71.1, title: 'Flights, commutes and waste', body: 'It happens outside your walls but because of your business: 90,000 km flown, 120 people commuting, 30 tonnes to landfill.', at: [0.54, 0.76] },
];
const TOTAL = STORY.reduce((s, x) => s + x.t, 0);
const COLORS = { 1: 'var(--s1)', 2: 'var(--s2)', 3: 'var(--s3)' };

const AGENTS = [
  { k: 'T', name: 'Terra', role: 'Guide for first-timers', color: '#7BD389', q: 'Think of it as a monthly electricity bill for the planet. Your biggest line item is the one to fix first.' },
  { k: 'I', name: 'Ignis', role: 'Scope 1, fuels and fleet', color: '#F08A4B', q: 'Your DG sets ran 1,400 hours last year. A CNG blend cuts 12 t now, while the EV plan catches up.' },
  { k: 'V', name: 'Volt', role: 'Scope 2, electricity', color: '#F2CF5B', q: 'You\'re above 100 kW, so green open access is open to you. It covers 90% of your power with no capex.' },
  { k: 'A', name: 'Atlas', role: 'Scope 3, value chain', color: '#6FB7D9', q: 'Rail for trips under 500 km plus video-first reviews takes 40% off your flight emissions.' },
  { k: 'S', name: 'Sage', role: 'For the CEO', color: '#C9A7FF', q: 'Approve the PPA this quarter. It saves ₹11 L a year and closes most of the 2030 gap.' },
  { k: 'L', name: 'Lex', role: 'For auditors and investors', color: '#E6E6E6', q: '836 t, with an 80% range of 792–879 t. Here is every factor and its source.' },
  { k: 'D', name: 'Archivist', role: 'Reads your documents', color: '#B8E0C8', q: 'Sorted 14 files: 12 electricity bills, a fuel log, a waste manifest. Commuting data is still missing.' },
];

function useLenis(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const lenis = new Lenis({ lerp: 0.11 });
    let id;
    const raf = (time) => { lenis.raf(time); id = requestAnimationFrame(raf); };
    id = requestAnimationFrame(raf);
    return () => { cancelAnimationFrame(id); lenis.destroy(); };
  }, [enabled]);
}

function Stratum({ progress, item }) {
  const h = useTransform(progress, item.at, ['0%', `${(item.t / (TOTAL * 1.06)) * 100}%`]);
  return (
    <motion.div className="stratum" style={{ height: h, background: COLORS[item.scope] }}>
      {item.t > 100 ? `Scope ${item.scope}` : ''}
    </motion.div>
  );
}

function Story() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [step, setStep] = useState(-1);
  const [shown, setShown] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    let s = -1;
    let sum = 0;
    STORY.forEach((it, i) => {
      const [a, b] = it.at;
      if (p >= a) s = i;
      sum += it.t * Math.min(Math.max((p - a) / (b - a), 0), 1);
    });
    if (p >= 0.8) s = 3;
    setStep(s);
    setShown(sum);
  });

  return (
    <section className="story" ref={ref} aria-label="How a year of activity becomes carbon">
      <div className="story-stage">
        <div className="story-steps">
          {STORY.map((it, i) => (
            <div key={it.title} className={`story-step ${step === i ? 'on' : ''}`}>
              <h3><span className="dot" style={{ background: COLORS[it.scope] }} />{it.title}</h3>
              <p>{it.body}</p>
            </div>
          ))}
          <div className={`story-step ${step === 3 ? 'on' : ''}`}>
            <h3>836 tonnes, and why</h3>
            <p>CarbonAI shows the factor, the source and the uncertainty behind every number, so a CEO and an auditor can both trust it.</p>
          </div>
        </div>

        <div className="column-wrap">
          <div className="column-total" aria-live="polite">{Math.round(shown).toLocaleString('en-IN')} <small>tCO₂e a year</small></div>
          <div className="column">
            {STORY.map((it) => <Stratum key={it.scope} progress={scrollYProgress} item={it} />)}
          </div>
        </div>

        <div className="story-legend">
          <div className="legend-row"><i style={{ background: 'var(--s1)' }} /><div><b>Scope 1</b>What you burn on site</div></div>
          <div className="legend-row"><i style={{ background: 'var(--s2)' }} /><div><b>Scope 2</b>What you plug in</div></div>
          <div className="legend-row"><i style={{ background: 'var(--s3)' }} /><div><b>Scope 3</b>What your business causes elsewhere</div></div>
        </div>
      </div>
    </section>
  );
}

function AgentsTrack() {
  const ref = useRef(null);
  const track = useRef(null);
  const [dist, setDist] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0.05, 0.95], [0, -dist]);

  useEffect(() => {
    const measure = () => track.current && setDist(Math.max(track.current.scrollWidth - window.innerWidth + 80, 0));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <section className="agents-track-wrap" ref={ref} id="agents">
      <div className="agents-sticky">
        <header>
          <h2 className="section-title">Seven specialists, each with one job</h2>
          <p className="section-lede">Every agent knows your company, sees only its own scope and explains why it recommends what it does. They run on our Nugen-aligned carbon model.</p>
        </header>
        <motion.div className="agents-track" ref={track} style={{ x }}>
          {AGENTS.map((a) => (
            <article className="agent-tile" key={a.name}>
              <div className="agent-face" style={{ background: a.color }}>{a.k}</div>
              <h3>{a.name}</h3>
              <div className="role">{a.role}</div>
              <blockquote style={{ borderColor: a.color }}>{a.q}</blockquote>
            </article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Paths() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const draw = useSpring(useTransform(scrollYProgress, [0.15, 1], [0, 1]), { stiffness: 80, damping: 20 });
  // y = 260 - t*0.2  (836t ≈ y 93)
  const y = (v) => 260 - v * 0.2;
  const pts = (arr) => arr.map((v, i) => `${40 + i * 180},${y(v)}`).join(' ');
  const bau = [836, 880, 925, 970, 1015, 1060];
  const plan = [836, 740, 610, 470, 390, 340];
  const target = [836, 801, 767, 735, 704, 675];
  return (
    <section className="paths" ref={ref}>
      <h2 className="section-title">Try futures before you pay for one</h2>
      <p className="section-lede">Build several scenarios, choose the scope and the time resolution, switch climate tech on and off, and see the cost, payback and 2030 gap for each.</p>
      <svg className="paths-chart" viewBox="0 0 980 280" role="img" aria-label="Business as usual rises to 1,060 tonnes by 2031 while the green power plan falls to 340 tonnes">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <text key={i} x={40 + i * 180} y={278} fontSize="13" fill="#5B6F6A" textAnchor="middle">{2026 + i}</text>
        ))}
        <polyline points={pts(target)} fill="none" stroke="#2E8B57" strokeWidth="2" strokeDasharray="6 6" />
        <motion.polyline points={pts(bau)} fill="none" stroke="#0F2B2E" strokeWidth="3.5" style={{ pathLength: draw }} />
        <motion.polyline points={pts(plan)} fill="none" stroke="#F08A4B" strokeWidth="5" strokeLinecap="round" style={{ pathLength: draw }} />
        <text x={950} y={y(1060) - 10} fontSize="14" textAnchor="end" fill="#0F2B2E">Do nothing: 1,060 t</text>
        <text x={950} y={y(675) - 10} fontSize="14" textAnchor="end" fill="#2E8B57">1.5 °C limit</text>
        <text x={950} y={y(340) + 24} fontSize="14" textAnchor="end" fill="#C4572B">Efficiency + solar + green PPA: 340 t</text>
      </svg>
      <div className="paths-notes">
        <div><b>Pick the scope</b><p>Run a Scope 2-only plan, a fleet-only plan or the whole company.</p></div>
        <div><b>Pick the resolution</b><p>Monthly for operations teams, quarterly for the board, yearly for strategy.</p></div>
        <div><b>See the justification</b><p>Each line shows the growth, ramp-up and grid assumptions behind it.</p></div>
      </div>
    </section>
  );
}

export default function Landing() {
  const reduce = useReducedMotion();
  useLenis(!reduce);
  const { scrollYProgress } = useScroll();
  const nav = useNavigate();
  const { loadSample } = useStore();
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, 120]);

  return (
    <div className="landing">
      <motion.div className="progress" style={{ scaleX: scrollYProgress }} />
      <header className="topnav">
        <Link to="/" className="brand"><span className="brand-mark" />CarbonAI</Link>
        <nav>
          <a href="#agents" className="hide-sm">Agents</a>
          <a href="#views" className="hide-sm">Dashboards</a>
          <a href="#engine" className="hide-sm">Nugen model</a>
          <Link to="/app/assess" className="btn btn-solid btn-sm">Measure my footprint</Link>
        </nav>
      </header>

      <section className="hero">
        <motion.img src={heroImg} alt="" className="hero-photo" style={{ y: heroY }} />
        <div>
          <h1>Your bills already know your carbon.</h1>
          <p className="hero-sub">Upload electricity bills and fuel logs. CarbonAI turns them into Scope 1, 2 and 3 emissions, explains every number, and plans cuts that pay for themselves.</p>
          <div className="hero-cta">
            <Link to="/app/assess" className="btn btn-solid">Measure my footprint</Link>
            <button type="button" className="btn btn-ghost" onClick={() => { loadSample(); nav('/app/ceo'); }}>Open the demo company</button>
          </div>
        </div>
        <div className="hero-figure">
          <div className="big">0.727</div>
          <p className="cap">kg of CO₂ in every unit of Indian grid electricity (CEA, FY2023-24). Scroll to see where a factory's year goes.</p>
        </div>
      </section>

      <Story />
      <AgentsTrack />
      <Paths />

      <section className="two-views" id="views">
        <h2 className="section-title">One assessment, two dashboards</h2>
        <p className="section-lede" style={{ color: 'var(--muted)' }}>The CEO sees decisions and rupees. Investors, auditors and customers see the method behind them.</p>
        <div className="views-grid">
          <div className="view">
            <h3>CEO dashboard</h3>
            <div className="mini">{[70, 52, 40, 31, 22].map((h, i) => <span key={i} style={{ height: `${h}%`, background: i === 0 ? 'var(--s2)' : 'var(--ink-3)' }} />)}</div>
            <ul><li>Footprint, 2030 gap and readiness score</li><li>Climate-tech switches ranked by ₹ per tonne</li><li>Scenario winner with payback</li><li>BRSR Core, CCTS and CBAM watch-list</li></ul>
          </div>
          <div className="view">
            <h3>Stakeholder dashboard</h3>
            <div className="mini">{[100, 100, 100, 100, 100].map((h, i) => <span key={i} style={{ height: `${[30, 60, 45, 80, 55][i]}%`, background: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--line)', 'var(--leaf)'][i] }} />)}</div>
            <ul><li>Scope breakdown in plain language</li><li>Every factor with its source</li><li>Uncertainty range and data-quality flags</li><li>Downloadable disclosure in PDF or Excel</li></ul>
          </div>
        </div>
      </section>

      <section className="engine" id="engine">
        <div>
          <h2 className="section-title">Aligned on carbon, run where you choose</h2>
          <p className="section-lede">Our model is aligned on Nugen with GHG Protocol methods, Indian emission factors and climate-tech costs. For development you can run the same agents on LM Studio on your own laptop, with no credits used.</p>
        </div>
        <div className="engine-card">
          <div className="engine-row"><b>In the cloud</b><span>Nugen inference API with the CarbonAI aligned model</span></div>
          <div className="engine-row"><b>On your laptop</b><span>LM Studio or Ollama, any open model, works offline</span></div>
          <div className="engine-row"><b>If both fail</b><span>The analytics engine still answers, clearly labelled</span></div>
        </div>
      </section>

      <section className="cta-end">
        <h2>Start with last year's bills.</h2>
        <div className="hero-cta"><Link to="/app/assess" className="btn btn-solid">Measure my footprint</Link></div>
      </section>
      <footer className="footer"><span>CarbonAI by TerraTech for Indradhanu Hackathon 2026: AI for a Greener Tomorrow</span><span>Factors: CEA v20, IPCC 2006, DEFRA</span></footer>
    </div>
  );
}
