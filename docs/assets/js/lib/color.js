// Colour maths for the theme engine: parsing, mixing, WCAG contrast.
// Pure functions; shared by the browser and the node tests.

export function parse(c) {
  if (Array.isArray(c)) return [c[0], c[1], c[2], c[3] ?? 1];
  const s = String(c).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`Unparseable colour: ${c}`);
}

const clamp = (v, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, v));
export const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('');
export const rgba = (c, a) => { const [r, g, b] = parse(c); return `rgba(${r}, ${g}, ${b}, ${a})`; };

/** Straight sRGB mix: t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const A = parse(a), B = parse(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Composite a translucent colour over an opaque ground. */
export function over(fg, ground) {
  const F = parse(fg), G = parse(ground);
  const a = F[3];
  return hex([F[0] * a + G[0] * (1 - a), F[1] * a + G[1] * (1 - a), F[2] * a + G[2] * (1 - a)]);
}

export function luminance(c) {
  const [r, g, b] = parse(c).map((v, i) => (i < 3 ? v / 255 : v));
  const f = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2.x contrast ratio. Translucent foregrounds are composited over the ground first. */
export function contrast(fg, ground) {
  const g = over(ground, '#000000');
  const f = parse(fg)[3] < 1 ? over(fg, g) : fg;
  const L1 = luminance(f), L2 = luminance(g);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/** Pick the more legible of two inks for text on a fill. */
export function inkOn(fill, dark = '#0b0b0f', light = '#ffffff') {
  return contrast(dark, fill) >= contrast(light, fill) ? dark : light;
}

/** Move a colour toward black or white in small steps until it reaches `target` contrast on `ground`. */
export function ensureContrast(c, ground, target) {
  if (contrast(c, ground) >= target) return hex(parse(c));
  const towards = luminance(ground) > 0.4 ? '#000000' : '#ffffff';
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const m = mix(c, towards, t);
    if (contrast(m, ground) >= target) return m;
  }
  return towards;
}

/** Smallest alpha of `fg` over `ground` that reaches `target` contrast (for muted text). */
export function alphaFor(fg, ground, target, start = 0.5) {
  for (let a = start; a <= 1.0001; a += 0.02) {
    const c = rgba(fg, +a.toFixed(2));
    if (contrast(c, ground) >= target) return +a.toFixed(2);
  }
  return 1;
}

export const toRGB = (c, a = 255) => { const p = parse(c); return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * a)]; };
