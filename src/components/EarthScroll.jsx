/* Cinematic scroll scene: a dotted 3D Earth (public-domain Natural Earth land data)
   with pollution hotspots. Scrolling spins it to India, zooms in and clears the smog.
   Canvas-only, transform/opacity overlays, ~60 fps, reduced-motion aware. */
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import LAND from '../assets/land-dots.json';

const D2R = Math.PI / 180;
const HOTSPOTS = [
  [39.9, 116.4, 1], [31.2, 121.5, 0.9], [23.1, 113.3, 0.8], [28.6, 77.2, 1], [19.1, 72.9, 0.75], [22.6, 88.4, 0.65],
  [40.7, -74.0, 0.8], [29.8, -95.4, 0.75], [34.1, -118.2, 0.6], [41.9, -87.6, 0.5], [55.8, 37.6, 0.7], [51.5, 7.5, 0.6],
  [35.7, 139.7, 0.7], [37.6, 127.0, 0.6], [-26.2, 28.0, 0.6], [-23.5, -46.6, 0.5], [-6.2, 106.8, 0.6], [24.7, 46.7, 0.6],
  [35.7, 51.4, 0.55], [30.0, 31.2, 0.45], [19.4, -99.1, 0.5], [6.5, 3.4, 0.4],
];
const PUNE = [18.52, 73.86];
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mixRGB = (c1, c2, t) => c1.map((v, i) => Math.round(mix(v, c2[i], t)));

function makeSprite(rgb) {
  const s = document.createElement('canvas');
  s.width = s.height = 128;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb},0.9)`);
  grd.addColorStop(0.35, `rgba(${rgb},0.35)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return s;
}

function Globe({ progress }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const smog = makeSprite('196,120,70');
    const haze = makeSprite('150,140,130');
    const glowG = makeSprite('123,211,137');
    const stars = Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random() * 1.2 + 0.2, Math.random() * 6]);
    let w = 0; let h = 0; let raf = 0; let visible = true; let spin = -10; let last = performance.now();
    const resize = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();

    const frame = (now) => {
      const dt = Math.min(now - last, 50); last = now;
      const p = progress.get();
      const k = smooth(0.3, 0.62, p);            // turn to India
      const zoom = smooth(0.38, 0.72, p);
      const clean = smooth(0.7, 0.93, p);
      if (!reduce) spin += dt * 0.006 * (1 - k);
      const lon0 = mix(spin, 78, k) * D2R;
      const lat0 = mix(12, 20, k) * D2R;
      const base = Math.min(w, h) * 0.36;
      const R = base * mix(1, 2.1, zoom);
      const cx = w * mix(0.7, 0.5, smooth(0.12, 0.3, p));
      const cy = h * mix(0.54, 0.62, zoom);
      const sinL0 = Math.sin(lat0); const cosL0 = Math.cos(lat0);

      ctx.clearRect(0, 0, w, h);
      // stars
      for (const s of stars) {
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(now / 900 + s[3]);
        ctx.fillStyle = '#E9EFE8';
        ctx.fillRect(s[0] * w, s[1] * h, s[2], s[2]);
      }
      ctx.globalAlpha = 1;

      // atmosphere
      const atm = mixRGB([214, 140, 80], [111, 211, 170], clean);
      const ag = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
      ag.addColorStop(0, `rgba(${atm},0.42)`);
      ag.addColorStop(1, `rgba(${atm},0)`);
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.fill();

      // ocean sphere with light from top-left
      const og = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
      og.addColorStop(0, `rgb(${mixRGB([52, 66, 70], [28, 92, 100], clean)})`);
      og.addColorStop(1, '#071a1c');
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // land dots
      const land = mixRGB([201, 162, 122], [123, 211, 137], clean);
      const dot = Math.max(1.2, R / 190);
      ctx.fillStyle = `rgb(${land})`;
      for (let i = 0; i < LAND.length; i += 2) {
        const lam = LAND[i] * D2R - lon0; const phi = LAND[i + 1] * D2R;
        const cosPhi = Math.cos(phi); const sinPhi = Math.sin(phi); const cosLam = Math.cos(lam);
        const cosc = sinL0 * sinPhi + cosL0 * cosPhi * cosLam;
        if (cosc <= 0) continue;
        const x = cx + R * cosPhi * Math.sin(lam);
        const y = cy - R * (cosL0 * sinPhi - sinL0 * cosPhi * cosLam);
        ctx.globalAlpha = 0.35 + 0.65 * cosc;
        ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
      }

      // hotspots + smog
      const smogAmt = 1 - clean;
      for (const [la, lo, inten] of HOTSPOTS) {
        const lam = lo * D2R - lon0; const phi = la * D2R;
        const cosc = sinL0 * Math.sin(phi) + cosL0 * Math.cos(phi) * Math.cos(lam);
        if (cosc <= 0.05) continue;
        const x = cx + R * Math.cos(phi) * Math.sin(lam);
        const y = cy - R * (cosL0 * Math.sin(phi) - sinL0 * Math.cos(phi) * Math.cos(lam));
        const pulse = 0.85 + 0.15 * Math.sin(now / 500 + la);
        const size = R * 0.42 * inten * pulse;
        ctx.globalAlpha = smogAmt * cosc * 0.75;
        ctx.drawImage(haze, x - size * 1.3, y - size * 1.3, size * 2.6, size * 2.6);
        ctx.drawImage(smog, x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = Math.max(smogAmt, 0.15) * cosc;
        ctx.fillStyle = smogAmt > 0.3 ? '#F08A4B' : '#7BD389';
        ctx.beginPath(); ctx.arc(x, y, Math.max(2, R / 140), 0, Math.PI * 2); ctx.fill();
      }

      // Pune marker when zoomed on India
      if (k > 0.5) {
        const lam = PUNE[1] * D2R - lon0; const phi = PUNE[0] * D2R;
        const x = cx + R * Math.cos(phi) * Math.sin(lam);
        const y = cy - R * (cosL0 * Math.sin(phi) - sinL0 * Math.cos(phi) * Math.cos(lam));
        const a = smooth(0.5, 0.65, k) * (1 - smooth(0.68, 0.76, p));
        ctx.globalAlpha = a;
        const rr = 10 + 6 * Math.sin(now / 400);
        ctx.drawImage(glowG, x - rr * 3, y - rr * 3, rr * 6, rr * 6);
        ctx.strokeStyle = '#7BD389'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#F5F8F4'; ctx.font = '600 14px "Public Sans Variable", sans-serif';
        ctx.fillText('Pune: Shakti Textiles, 836 t', x + 14, y + 5);
      }
      ctx.globalAlpha = 1;
      if (visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); } });
    io.observe(c);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', resize); };
  }, [progress, reduce]);
  return <canvas ref={ref} className="earth-canvas" aria-hidden="true" />;
}

function Phase({ progress, range, children, className = '' }) {
  const [a, b, c2, d] = range;
  const opacity = useTransform(progress, [a, b, c2, d], [0, 1, 1, 0]);
  const y = useTransform(progress, [a, b, c2, d], [60, 0, 0, -60]);
  const scale = useTransform(progress, [a, d], [0.94, 1.04]);
  return <motion.div className={`earth-phase ${className}`} style={{ opacity, y, scale }}>{children}</motion.div>;
}

export default function EarthScroll({ hero }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12, 0.2], [1, 1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, -120]);
  const heroEvents = useTransform(scrollYProgress, (p) => (p < 0.16 ? 'auto' : 'none'));
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  return (
    <section className="earth" ref={ref} aria-label="The planet's carbon, then yours">
      <div className="earth-stage">
        <Globe progress={scrollYProgress} />
        <div className="earth-vignette" aria-hidden />
        <motion.div className="earth-hero" style={{ opacity: heroOpacity, y: heroY, pointerEvents: heroEvents }}>{hero}</motion.div>

        <Phase progress={scrollYProgress} range={[0.18, 0.25, 0.36, 0.43]} className="center">
          <div className="mega">37.4 billion</div>
          <p className="mega-sub">tonnes of CO₂ from fossil fuels in 2024, a new record. Every city that glows on this globe adds to it.</p>
        </Phase>
        <Phase progress={scrollYProgress} range={[0.44, 0.52, 0.62, 0.7]} className="left">
          <div className="mega">India</div>
          <p className="mega-sub">8% of the world's fossil CO₂, and rising 4.6% a year. Every unit from our grid carries about 0.73 kg of it.</p>
        </Phase>
        <Phase progress={scrollYProgress} range={[0.74, 0.82, 0.97, 0.999]} className="center">
          <div className="mega green">Clear the air.</div>
          <p className="mega-sub">It starts with one company knowing its number, and the cheapest way to cut it.</p>
        </Phase>
        <div className="earth-progress" aria-hidden><motion.span style={{ height: bar }} /></div>
      </div>
      <p className="earth-source">Global figures: Global Carbon Budget 2024. Map: Natural Earth (public domain).</p>
    </section>
  );
}
