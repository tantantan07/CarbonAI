import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

/** Number that counts up to `value` whenever it changes. */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1.1 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const target = Number(value) || 0;
    if (reduce) { from.current = target; return undefined; }
    const c = animate(from.current, target, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    from.current = target;
    return () => c.stop();
  }, [value, duration, reduce]);
  const v = reduce ? Number(value) || 0 : shown;
  return <>{prefix}{v.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</>;
}

/** Circular gauge, 0–100. */
export function Ring({ value, size = 120, stroke = 10, color = 'var(--leaf-deep)', track = 'var(--line)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

/** Card that tilts gently toward the pointer. */
export function Tilt({ children, className = '', max = 8 }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [max, -max]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-max, max]), { stiffness: 150, damping: 18 });
  const glowX = useTransform(mx, [-0.5, 0.5], ['0%', '100%']);
  const glowY = useTransform(my, [-0.5, 0.5], ['0%', '100%']);
  const bg = useTransform([glowX, glowY], ([x, y]) => `radial-gradient(520px circle at ${x} ${y}, rgba(123,211,137,.16), transparent 45%)`);
  const onMove = (e) => {
    if (reduce) return;
    const b = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - b.left) / b.width - 0.5);
    my.set((e.clientY - b.top) / b.height - 0.5);
  };
  return (
    <motion.div
      className={`tilt ${className}`}
      onPointerMove={onMove}
      onPointerLeave={() => { mx.set(0); my.set(0); }}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
    >
      <motion.div className="tilt-glow" style={{ background: bg }} />
      {children}
    </motion.div>
  );
}

/** Rising "CO₂" particle network for the hero. Pauses off-screen and respects reduced motion. */
export function ParticleField() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const colors = ['240,138,75', '242,207,91', '111,183,217', '123,211,137'];
    let w = 0; let h = 0; let raf = 0; let visible = true;
    const mouse = { x: -9999, y: -9999 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let parts = [];
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, (w * h) / 14000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.4,
        vy: 0.15 + Math.random() * 0.45, vx: (Math.random() - 0.5) * 0.15, c: colors[Math.floor(Math.random() * colors.length)],
        a: 0.25 + Math.random() * 0.6,
      }));
    };
    const step = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (!reduce) {
          p.y -= p.vy; p.x += p.vx;
          const dx = p.x - mouse.x; const dy = p.y - mouse.y; const d2 = dx * dx + dy * dy;
          if (d2 < 14000) { const f = (14000 - d2) / 14000; p.x += (dx / 60) * f; p.y += (dy / 60) * f; }
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c},${p.a})`; ctx.fill();
      }
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i]; const b = parts[j];
          const dx = a.x - b.x; const dy = a.y - b.y; const d = dx * dx + dy * dy;
          if (d < 9000) {
            ctx.strokeStyle = `rgba(201,218,211,${0.12 * (1 - d / 9000)})`;
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      if (visible && !reduce) raf = requestAnimationFrame(step);
    };
    const onMove = (e) => { const b = canvas.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(step); } });
    resize(); step();
    io.observe(canvas);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); };
  }, [reduce]);
  return <canvas ref={ref} className="particles" aria-hidden="true" />;
}

/** Words that rise in one after another (one orchestrated page-load moment). */
export function RevealWords({ text, className, delay = 0 }) {
  const reduce = useReducedMotion();
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="rw-mask" aria-hidden="true">
          <motion.span
            className="rw-word"
            initial={reduce ? false : { y: '110%' }}
            animate={{ y: '0%' }}
            transition={{ delay: delay + i * 0.07, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >{w}&nbsp;</motion.span>
        </span>
      ))}
    </span>
  );
}
