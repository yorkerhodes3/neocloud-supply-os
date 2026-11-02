// Seeded PRNG and helpers. Deterministic across browsers and node.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit seed (FNV-1a). */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class Rng {
  constructor(seed) { this.seed = seed >>> 0; this.next = mulberry32(this.seed); }
  float(lo = 0, hi = 1) { return lo + (hi - lo) * this.next(); }
  int(lo, hi) { return Math.floor(this.float(lo, hi + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  /** Triangular distribution: a cheap, bounded stand-in for a lead-time spread. */
  tri(lo, mode, hi) {
    const u = this.next(), c = (mode - lo) / (hi - lo);
    return u < c ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
  }
  /** Lognormal-ish positive delay with median m and spread s. */
  logn(m, s) {
    const u1 = Math.max(1e-9, this.next()), u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return m * Math.exp(s * z);
  }
  weighted(items, w) {
    const tot = w.reduce((a, b) => a + b, 0);
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
}
