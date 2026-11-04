import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import Lenis from 'lenis';
import { useStore } from '../state/store';
import sceneImg from '../assets/scene.webp';
import sceneSm from '../assets/scene-sm.webp';
import globeImg from '../assets/globe.webp';
import { BeamButton, Marquee, TextReveal, TiltCard } from '../components/Fx';
import EarthScroll from '../components/EarthScroll';

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

const FRAMEWORKS = [
  ['GHG Protocol', 'Corporate Standard'], ['CEA v20', 'Indian grid factor'], ['BRSR Core', 'SEBI disclosures'], ['CCTS', "India's carbon market"],
  ['IPCC 2006', 'Combustion factors'], ['SBTi', '1.5 °C pathway'],
];
const FRAMEWORKS2 = [
  ['EU CBAM', 'Export reporting'], ['Green Open Access', '2022 Rules'], ['PAT', 'BEE scheme'], ['DEFRA', 'Travel factors'],
  ['SWM Rules', 'Waste 2016'], ['Nugen', 'Aligned inference'],
];

function trackGlow(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function Bento() {
  const cards = [
    { cls: 'b-a', title: 'Scenario planner', body: 'Build up to six futures. Pick the scope each one may change and the time resolution, and see the 2030 gap and payback for each.', visual: <BentoChart /> },
    { cls: 'b-b', title: 'Switch your climate tech', body: 'Flip technologies on and see tonnes, ₹ and payback change instantly.', visual: (
      <div className="toggle-list">{[['LED + smart HVAC', true], ['Rooftop solar', true], ['Green open-access PPA', true], ['EV fleet', false], ['Heat pumps', false]].map(([t, on]) => (
        <div className="toggle" key={t}><span>{t}</span><span className={`switch ${on ? 'on' : ''}`} /></div>))}</div>) },
    { cls: 'b-c', title: 'Reads your documents', body: 'Bills, fuel logs and manifests, sorted and extracted with evidence.', visual: (
      <div className="doc-stack"><div className="doc"><span>msedcl-apr.pdf</span><span>8,50,000 kWh</span></div><div className="doc"><span>fuel-log.csv</span><span>18,000 L</span></div></div>) },
    { cls: 'b-d', title: 'Two dashboards', body: 'Decisions and rupees for the CEO. Method, sources and uncertainty for auditors and investors.' },
    { cls: 'b-e', title: 'Reports in one click', body: 'Board brief or disclosure statement, as PDF, Excel or JSON, with an AI-written summary.' },
  ];
  return (
    <section className="bento-sec">
      <h2 className="section-title">Everything a sustainability team does, in one place</h2>
      <p className="section-lede">Built for people who have never done carbon accounting, and checked well enough for the people who have.</p>
      <div className="bento">
        {cards.map((c, i) => (
          <motion.div key={c.title} className={`glow-card ${c.cls}`} onPointerMove={trackGlow}
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6, delay: i * 0.06 }}>
            <h3>{c.title}</h3><p>{c.body}</p>
            {c.visual && <div className="bento-visual">{c.visual}</div>}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function BentoChart() {
  const pts = (arr) => arr.map((v, i) => `${i * 120},${160 - v}`).join(' ');
  return (
    <svg viewBox="0 0 600 170" width="100%" height="190" role="img" aria-label="Three scenario lines falling below the business-as-usual line">
      <defs><linearGradient id="bg1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7BD389" stopOpacity=".35" /><stop offset="1" stopColor="#7BD389" stopOpacity="0" /></linearGradient></defs>
      <polyline points={pts([90, 100, 110, 120, 130, 140])} fill="none" stroke="rgba(233,239,232,.5)" strokeWidth="2" strokeDasharray="5 6" />
      <motion.polygon points={`0,170 ${pts([90, 72, 55, 40, 30, 24])} 600,170`} fill="url(#bg1)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1.2 }} />
      {[[[90, 80, 70, 64, 60, 58], '#6FB7D9'], [[90, 84, 76, 70, 66, 62], '#F08A4B'], [[90, 72, 55, 40, 30, 24], '#7BD389']].map(([d, c], i) => (
        <motion.polyline key={c} points={pts(d)} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.2 + i * 0.2 }} />
      ))}
    </svg>
  );
}

const FLY_WORDS = [
  { word: 'Measure.', cap: 'Every kWh, litre and kilometre your business used last year.', at: [0.04, 0.3] },
  { word: 'Understand.', cap: 'Scope 1, 2 and 3, explained by seven AI agents in plain words.', at: [0.32, 0.6] },
  { word: 'Reduce.', cap: 'Cuts that pay for themselves, planned before you spend a rupee.', at: [0.62, 0.9] },
];

function FlyWord({ p, w }) {
  const [a, b] = w.at;
  const m1 = a + (b - a) * 0.25;
  const m2 = b - (b - a) * 0.25;
  const opacity = useTransform(p, [a, m1, m2, b], [0, 1, 1, 0]);
  const scale = useTransform(p, [a, m1, m2, b], [1.35, 1, 1, 0.9]);
  const ghost = useTransform(p, [a, m1, m2, b], [40, 0, 0, -30]);
  const ghostX = useMotionTemplate`${ghost}px`;
  return (
    <motion.div className="fly-word" style={{ opacity }}>
      <motion.h2 style={{ scale }} aria-label={w.word}>
        <motion.span aria-hidden className="ghost g1" style={{ x: ghostX }}>{w.word}</motion.span>
        <span aria-hidden className="ghost g2">{w.word}</span>
        <span className="solid">{w.word}</span>
      </motion.h2>
      <p>{w.cap}</p>
    </motion.div>
  );
}

function Flythrough() {
  const ref = useRef(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const scale = useTransform(p, [0, 1], [1.08, 3.4]);
  const rotate = useTransform(p, [0, 1], [0, -8]);
  const dim = useTransform(p, [0, 0.12, 0.85, 1], [0.5, 0.28, 0.4, 1]);
  const gScale = useTransform(p, [0, 0.5, 0.85], [1, 1.25, 1.1]);
  const gX = useTransform(p, [0, 0.5, 0.85], ['0%', '-35%', '-10%']);
  const gY = useTransform(p, [0, 0.5, 0.85], ['0%', '60%', '160%']);
  const gRot = useTransform(p, [0, 1], [0, 40]);
  const gOp = useTransform(p, [0, 0.6, 0.8], [1, 1, 0]);
  const hint = useTransform(p, [0, 0.05], [1, 0]);
  return (
    <section className="fly" ref={ref} aria-label="Measure, understand, reduce">
      <div className="fly-stage">
        <motion.div className="fly-scene" style={{ scale, rotate }}>
          <img src={sceneImg} srcSet={`${sceneSm} 960w, ${sceneImg} 1586w`} sizes="100vw" alt="Looking up through a tower of trees at a glass globe" />
          <motion.img src={globeImg} alt="" className="fly-globe" style={{ scale: gScale, x: gX, y: gY, rotate: gRot, opacity: gOp }} />
        </motion.div>
        <motion.div className="fly-dim" style={{ opacity: dim }} />
        <div className="fly-vignette" />
        {FLY_WORDS.map((w) => <FlyWord key={w.word} p={p} w={w} />)}
        <motion.span className="fly-hint" style={{ opacity: hint }}>Keep scrolling</motion.span>
      </div>
    </section>
  );
}

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
  const stepRef = useRef(-1);
  const total = useTransform(scrollYProgress, (p) => {
    let sum = 0;
    STORY.forEach((it) => { const [a, b] = it.at; sum += it.t * Math.min(Math.max((p - a) / (b - a), 0), 1); });
    return Math.round(sum).toLocaleString('en-IN');
  });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    let s = -1;
    STORY.forEach((it, i) => { if (p >= it.at[0]) s = i; });
    if (p >= 0.8) s = 3;
    if (s !== stepRef.current) { stepRef.current = s; setStep(s); }
  });

  return (
    <section className="story" id="story" ref={ref} aria-label="How a year of activity becomes carbon">
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
          <div className="column-total" aria-live="polite"><motion.span>{total}</motion.span> <small>tCO₂e a year</small></div>
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
            <TiltCard className="agent-tile" key={a.name} max={7} style={{ '--agent': a.color }}>
              <div className="agent-face" style={{ background: a.color, color: a.color }}><span style={{ color: "var(--ink)" }}>{a.k}</span></div>
              <h3>{a.name}</h3>
              <div className="role">{a.role}</div>
              <blockquote style={{ borderColor: a.color }}>{a.q}</blockquote>
            </TiltCard>
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

      <EarthScroll hero={(
        <div className="earth-hero-inner">
          <motion.span className="badge-pill" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <b>New</b> Agents now run on our Nugen-aligned carbon model
          </motion.span>
          <TextReveal text="The planet keeps the receipts." delay={0.15} />
          <motion.p className="hero-sub" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.7 }}>
            CarbonAI turns your electricity bills and fuel logs into Scope 1, 2 and 3 emissions, explains every number, and plans the cuts that pay for themselves.
          </motion.p>
          <motion.div className="hero-cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.85 }}>
            <Link to="/app/assess" className="btn btn-solid">Measure my footprint</Link>
            <BeamButton type="button" onClick={() => { loadSample(); nav('/app/ceo'); }}>Open the demo company</BeamButton>
          </motion.div>
          <motion.div className="trust-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }}>
            <div><b>7</b>specialist AI agents</div>
            <div><b>10</b>climate-tech switches</div>
            <div><b>0.727</b>kg CO₂ per grid kWh (CEA)</div>
          </motion.div>
          <a href="#story" className="earth-cue">Scroll to see the planet, then your company</a>
        </div>
      )} />

      <section className="logos" aria-label="Standards and frameworks CarbonAI uses">
        <p>Built on the standards Indian businesses report against</p>
        <Marquee items={FRAMEWORKS.map(([b, t]) => <div className="chip-lg" key={b}><b>{b}</b>{t}</div>)} />
        <Marquee reverse speed={46} items={FRAMEWORKS2.map(([b, t]) => <div className="chip-lg" key={b}><b>{b}</b>{t}</div>)} />
      </section>

      <Flythrough />
      <Story />
      <AgentsTrack />
      <Bento />
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

      <section className="lamp">
        <motion.h2 initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>Start with last year's bills.</motion.h2>
        <div className="hero-cta" style={{ marginTop: 34 }}>
          <Link to="/app/assess" className="btn btn-solid">Measure my footprint</Link>
          <BeamButton type="button" onClick={() => { loadSample(); nav('/app/ceo'); }}>Open the demo company</BeamButton>
        </div>
      </section>
      <footer className="footer"><span>CarbonAI by TerraTech for Indradhanu Hackathon 2026: AI for a Greener Tomorrow</span><span>Factors: CEA v20, IPCC 2006, DEFRA</span></footer>
    </div>
  );
}
