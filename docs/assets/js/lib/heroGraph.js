// Hero canvas: an illustrative "living" supply graph.
// External counterparties (outer ring) → Envoy → desks (middle ring) → policy
// gate (dashed ring) → ledger (core). Some packets escalate to a human
// (they leave the core towards the cockpit marker). Purely decorative; driven
// by a seeded RNG so it looks the same on every load.
import { cssVar } from '../theme.js';
import { mulberry32 } from './rng.js';

export function heroGraph(canvas, { lanes = 10, desks = 36, onEvent } = {}) {
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(7);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0, colors = {}, running = true, t0 = performance.now();

  const deskNodes = Array.from({ length: desks }, (_, i) => ({ a: (i / desks) * Math.PI * 2, lane: i % lanes, r: 0.52 + rnd() * 0.06 }));
  const ext = Array.from({ length: 74 }, (_, i) => ({ a: rnd() * Math.PI * 2, r: 0.86 + rnd() * 0.32, kind: rnd() < 0.62 ? 'supplier' : rnd() < 0.5 ? 'site' : 'carrier', s: 1 + rnd() * 1.6, tw: rnd() * 6 }));
  const links = ext.map((e, i) => ({ e: i, d: Math.floor(((e.a / (Math.PI * 2)) * desks + (rnd() - 0.5) * 6 + desks) % desks) }));
  const packets = [];

  function readColors() {
    colors = {
      fg: cssVar('--fg'), muted: cssVar('--muted'), accent: cssVar('--accent'), glow: cssVar('--glow'),
      risk: cssVar('--risk'), warn: cssVar('--warn'), border: cssVar('--border'),
      series: ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'].map(cssVar),
    };
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W > 900;
    cx = wide ? W * 0.72 : W * 0.5; cy = wide ? H * 0.47 : H * 0.36;
    R = Math.min(wide ? W * 0.3 : W * 0.48, H * 0.46);
  }
  const pos = (a, r, rot) => [cx + Math.cos(a + rot) * r * R, cy + Math.sin(a + rot) * r * R * 0.82];

  function spawn() {
    const L = links[Math.floor(rnd() * links.length)];
    const roll = rnd();
    packets.push({ L, t: 0, sp: 0.0045 + rnd() * 0.004, kind: roll < 0.06 ? 'risk' : roll < 0.14 ? 'human' : 'ok' });
  }

  function frame(now) {
    const time = (now - t0) / 1000;
    const rot = reduce ? 0 : time * 0.018;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    // gate ring
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.3, R * 0.3 * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // orbit rings
    ctx.strokeStyle = colors.border;
    for (const rr of [0.55, 1.0]) { ctx.beginPath(); ctx.ellipse(cx, cy, R * rr, R * rr * 0.82, 0, 0, Math.PI * 2); ctx.stroke(); }
    // links ext→desk
    ctx.globalAlpha = 0.16; ctx.strokeStyle = colors.muted;
    ctx.beginPath();
    for (const L of links) {
      const e = ext[L.e], d = deskNodes[L.d];
      const [x1, y1] = pos(e.a, e.r, rot * 0.6), [x2, y2] = pos(d.a, d.r, rot);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    // desk→core spokes
    ctx.globalAlpha = 0.12; ctx.strokeStyle = colors.accent;
    ctx.beginPath();
    for (const d of deskNodes) { const [x, y] = pos(d.a, d.r, rot); ctx.moveTo(x, y); ctx.lineTo(cx, cy); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // external nodes
    for (const e of ext) {
      const [x, y] = pos(e.a, e.r, rot * 0.6);
      const tw = reduce ? 1 : 0.55 + 0.45 * Math.sin(time * 1.3 + e.tw);
      ctx.globalAlpha = 0.35 + 0.4 * tw;
      ctx.fillStyle = e.kind === 'site' ? colors.glow : e.kind === 'carrier' ? colors.series[2] : colors.muted;
      if (e.kind === 'site') ctx.fillRect(x - e.s - 1, y - e.s - 1, (e.s + 1) * 2, (e.s + 1) * 2);
      else { ctx.beginPath(); ctx.arc(x, y, e.s, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // desks
    for (const d of deskNodes) {
      const [x, y] = pos(d.a, d.r, rot);
      ctx.fillStyle = colors.series[d.lane % 6];
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // core (ledger)
    const pulse = reduce ? 0 : (Math.sin(time * 2) + 1) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
    g.addColorStop(0, colors.accent); g.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.22 + pulse * 0.1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    // cockpit marker (humans)
    const hx = cx, hy = cy - R * 1.14;
    ctx.strokeStyle = colors.glow; ctx.lineWidth = 1.4; ctx.strokeRect(hx - 7, hy - 7, 14, 14); ctx.lineWidth = 1;
    ctx.font = '10px ' + (cssVar('--font-mono') || 'monospace'); ctx.fillStyle = colors.muted; ctx.textAlign = 'center';
    ctx.fillText('COCKPIT', hx, hy - 14); ctx.fillText('LEDGER', cx, cy + 22);

    // packets
    if (!reduce && running && packets.length < 46 && rnd() < 0.5) spawn();
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.t += p.sp;
      const e = ext[p.L.e], d = deskNodes[p.L.d];
      const [x1, y1] = pos(e.a, e.r, rot * 0.6), [x2, y2] = pos(d.a, d.r, rot);
      let x, y;
      if (p.t < 0.5) { const k = p.t / 0.5; x = x1 + (x2 - x1) * k; y = y1 + (y2 - y1) * k; }
      else if (p.t < 1) { const k = (p.t - 0.5) / 0.5; x = x2 + (cx - x2) * k; y = y2 + (cy - y2) * k; }
      else if (p.kind === 'human' && p.t < 1.5) { const k = (p.t - 1) / 0.5; x = cx + (hx - cx) * k; y = cy + (hy - cy) * k; }
      else { packets.splice(i, 1); onEvent?.(p.kind); continue; }
      const col = p.kind === 'risk' ? colors.risk : p.kind === 'human' && p.t > 0.5 ? colors.glow : colors.accent;
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, p.kind === 'ok' ? 1.8 : 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (running && !reduce) requestAnimationFrame(frame);
  }

  readColors(); resize();
  addEventListener('resize', () => { resize(); if (reduce) frame(performance.now()); });
  addEventListener('themechange', () => { readColors(); if (reduce) frame(performance.now()); });
  new IntersectionObserver(([en]) => {
    const was = running; running = en.isIntersecting;
    if (running && !was && !reduce) requestAnimationFrame(frame);
  }).observe(canvas);
  requestAnimationFrame(frame);
}
