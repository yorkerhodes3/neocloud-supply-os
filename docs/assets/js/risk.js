// Risk-provider runtime: resolve → apply → persist → announce, mirroring theme.js.
// Resolution order (first wins): ?risk= → localStorage → DEFAULT_PROVIDER.
// Any text node or tooltip containing the RISK_PROVIDER token, whenever it is rendered,
// becomes a live slot that follows the active provider.
import { PROVIDERS, PROVIDER_ORDER, DEFAULT_PROVIDER, TOKEN, labelProvider, tool } from './providers.js';

const KEY = 'nso.risk';
const LABEL_KEY = 'nso.riskLabel';

export function loadLabel() { try { return localStorage.getItem(LABEL_KEY) || ''; } catch { return ''; } }
export function saveLabel(name) { name ? localStorage.setItem(LABEL_KEY, name) : localStorage.removeItem(LABEL_KEY); }

export function allProviders() {
  const out = {};
  for (const id of PROVIDER_ORDER) out[id] = PROVIDERS[id];
  const q = new URLSearchParams(location.search).get('riskName');
  const label = q || loadLabel();
  if (label) out.custom = labelProvider(label);
  return out;
}

export function resolveProviderId() {
  const all = allProviders();
  const q = new URLSearchParams(location.search).get('risk');
  if (q && all[q]) return q;
  const s = localStorage.getItem(KEY);
  if (s && all[s]) return s;
  return DEFAULT_PROVIDER;
}

let current = null;
export const currentProvider = () => current;

function sweep(root) {
  if (!root || !current) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.nodeValue.includes(TOKEN) && !n.parentElement?.closest('script,style,textarea,[data-risk-raw]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  const hits = [];
  while (walker.nextNode()) hits.push(walker.currentNode);
  for (const n of hits) {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(TOKEN).forEach((part, i) => {
      if (i) { const s = document.createElement('span'); s.dataset.riskName = ''; s.textContent = current.name; frag.appendChild(s); }
      if (part) frag.appendChild(document.createTextNode(part));
    });
    n.replaceWith(frag);
  }
  const els = root.querySelectorAll ? root.querySelectorAll('[data-tip],[title],[aria-label]') : [];
  for (const el of els) for (const a of ['data-tip', 'title', 'aria-label']) {
    const v = el.getAttribute(a);
    if (v && v.includes(TOKEN)) { el.setAttribute(`data-tpl-${a}`, v); }
    const tpl = el.getAttribute(`data-tpl-${a}`);
    if (tpl) el.setAttribute(a, tpl.replaceAll(TOKEN, current.name));
  }
}

export function applyProvider(id, { persist = true } = {}) {
  const all = allProviders();
  const p = all[id] || all[DEFAULT_PROVIDER];
  current = { id: all[id] ? id : DEFAULT_PROVIDER, ...p };
  const root = document.documentElement;
  root.dataset.risk = current.id;
  document.querySelectorAll('[data-risk-name]').forEach(n => { n.textContent = p.name; });
  document.querySelectorAll('[data-risk-short]').forEach(n => { n.textContent = p.short || p.name; });
  document.querySelectorAll('[data-risk-ns]').forEach(n => { n.textContent = p.ns; });
  document.querySelectorAll('[data-risk-tool]').forEach(n => {
    const t = tool(p, n.dataset.riskTool);
    n.textContent = t.shown || `no ${t.cap}`;
    n.classList.toggle('stand-in', !!t.stand);
    n.classList.toggle('gap', t.support === 'gap');
  });
  sweep(document.body);
  if (persist) localStorage.setItem(KEY, current.id);
  window.dispatchEvent(new CustomEvent('providerchange', { detail: current }));
  return current;
}

export function initProvider() {
  const p = applyProvider(resolveProviderId(), { persist: false });
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1) sweep(n);
      else if (n.nodeType === 3 && n.nodeValue.includes(TOKEN) && n.parentNode) sweep(n.parentNode);
    }
  }).observe(document.body, { childList: true, subtree: true });
  return p;
}
