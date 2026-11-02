// Theme runtime: resolve → derive → apply → persist → announce.
// Resolution order (first wins): ?brand= → localStorage → DEFAULT_BRAND.
import { BRANDS, derive, DEFAULT_BRAND } from './themes.js';

const KEY = 'nso.brand';
const VARS_KEY = 'nso.vars';
const CUSTOM_KEY = 'nso.customBrand';

export function allBrands() {
  const out = { ...BRANDS };
  const custom = loadCustom();
  if (custom) out.custom = custom;
  return out;
}

export function loadCustom() {
  try { const c = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'); return c && c.bg ? { ...c, kind: 'custom' } : null; } catch { return null; }
}
export function saveCustom(t) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(t)); }

export function resolveBrandId() {
  const q = new URLSearchParams(location.search).get('brand');
  const brands = allBrands();
  if (q && brands[q]) return q;
  const s = localStorage.getItem(KEY);
  if (s && brands[s]) return s;
  return DEFAULT_BRAND;
}

let current = null;
export const currentBrand = () => current;

export function applyBrand(id, { persist = true, theme } = {}) {
  const brands = allBrands();
  const t = theme || brands[id] || brands[DEFAULT_BRAND];
  const vars = derive(t);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.ground = t.ground === 'light' ? 'light' : 'dark';
  root.dataset.brand = id;
  current = { id, ...t, vars };
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = t.bg;
  document.querySelectorAll('[data-brand-short]').forEach(n => { n.textContent = t.short || t.name; });
  document.querySelectorAll('[data-brand-name]').forEach(n => { n.textContent = t.name; });
  document.querySelectorAll('[data-brand-product]').forEach(n => { n.textContent = t.product || t.short || t.name; });
  if (persist) {
    localStorage.setItem(KEY, id);
    // Cached for the inline pre-paint script in each page's <head>.
    localStorage.setItem(VARS_KEY, JSON.stringify({ id, ground: root.dataset.ground, vars }));
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: current }));
  return current;
}

/** Read a resolved CSS variable (for canvas / WebGL consumers). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Keep ?brand= on internal links so a shared URL keeps its dressing. */
export function brandHref(href) {
  if (!current || current.id === DEFAULT_BRAND || /^(https?:|mailto:|#)/.test(href)) return href;
  const u = new URL(href, location.href);
  u.searchParams.set('brand', current.id);
  return u.pathname.split('/').pop() + u.search + u.hash;
}

export function initTheme() {
  return applyBrand(resolveBrandId());
}
