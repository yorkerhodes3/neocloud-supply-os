// Shared page shell: nav with brand switcher, footer, reveal-on-scroll,
// card glow, tooltips and toasts. Every page calls mountShell().
import { initTheme, applyBrand, allBrands, currentBrand } from './theme.js';
import { initProvider, applyProvider, allProviders, currentProvider } from './risk.js';
import { coverage } from './providers.js';

const REPO = 'https://github.com/yorkerhodes3/neocloud-supply-os';

const NAV = [
  { href: 'index.html#solution', label: 'Solution', page: 'index' },
  { href: 'index.html#agents', label: 'Agents', page: 'index' },
  { href: 'index.html#risk', label: 'Risk', page: 'index' },
  { href: 'simulate.html', label: 'Simulation', page: 'simulate' },
  { href: 'negotiate.html', label: 'Negotiation', page: 'negotiate' },
  { href: 'method.html', label: 'Method', page: 'method' },
  { href: 'providers.html', label: 'Providers', page: 'providers' },
  { href: 'brand.html', label: 'Brand kit', page: 'brand' },
];

export const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <defs><linearGradient id="bm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--glow)"/></linearGradient></defs>
  <path d="M16 1.8 28.3 8.9v14.2L16 30.2 3.7 23.1V8.9Z" fill="none" stroke="url(#bm-g)" stroke-width="1.8"/>
  <rect x="9.5" y="10" width="13" height="2.6" rx="1" fill="var(--fg)" opacity=".92"/>
  <rect x="9.5" y="14.7" width="13" height="2.6" rx="1" fill="var(--fg)" opacity=".7"/>
  <rect x="9.5" y="19.4" width="13" height="2.6" rx="1" fill="var(--accent)"/>
  <circle cx="20.4" cy="11.3" r=".9" fill="var(--accent)"/>
</svg>`;

function navHTML(page) {
  return `<div class="wrap-wide nav-inner">
    <a class="brandmark" href="index.html" aria-label="Neocloud Supply OS home">${MARK}
      <span class="bm-text"><span class="bm-name"><span data-brand-product></span> Supply OS</span>
      <span class="bm-sub">Agent-first supply chain · concept demo</span></span></a>
    <nav class="nav-links" aria-label="Primary">
      ${NAV.map(n => `<a href="${n.href}" ${n.page === page && !n.href.includes('#') ? 'aria-current="page"' : ''}>${n.label}</a>`).join('')}
    </nav>
    <div class="pop" id="brandPop">
      <button class="btn sm" id="brandBtn" aria-haspopup="true" aria-expanded="false" title="Swap brand theme">
        <span class="sw-mini" aria-hidden="true" style="display:inline-flex;gap:2px"><i style="width:8px;height:12px;border-radius:2px;background:var(--accent)"></i><i style="width:8px;height:12px;border-radius:2px;background:var(--glow)"></i></span>
        <span class="bb-label"><span class="sr-only">Brand theme: </span><span data-brand-short></span></span> <span aria-hidden="true">▾</span></button>
      <div class="pop-panel" role="menu" aria-label="Brand themes"><div id="brandList"></div>
        <div class="pop-foot">Brand themes are approximate demo dressings built from public visual identity — no logos, no affiliation. <a class="inline" href="brand.html">Open the brand kit →</a></div></div>
    </div>
    <div class="pop" id="riskPop">
      <button class="btn sm" id="riskBtn" aria-haspopup="true" aria-expanded="false" title="Swap third-party risk provider">
        <svg class="rk-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2 13.6 3.3v4.2c0 3.4-2.3 6.1-5.6 7.3C4.7 13.6 2.4 10.9 2.4 7.5V3.3Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.4 8.1 7.2 9.8l3.4-3.6" fill="none" stroke="var(--accent)" stroke-width="1.6"/></svg>
        <span class="bb-label"><span class="sr-only">Risk provider: </span><span data-risk-short></span></span> <span aria-hidden="true">▾</span></button>
      <div class="pop-panel" role="menu" aria-label="Third-party risk providers"><div id="riskList"></div>
        <div class="pop-foot">The design names no provider: every risk call goes through a canonical interface mapped per provider. Signals are simulated. <a class="inline" href="providers.html">Open the provider kit →</a></div></div>
    </div>
    <button class="btn icon nav-toggle" aria-label="Menu" id="navToggle">☰</button>
  </div>`;
}

function footHTML() {
  return `<div class="wrap"><div class="cols">
    <div><div class="brandmark" style="margin-bottom:14px">${MARK}<span class="bm-text"><span class="bm-name"><span data-brand-product></span> Supply OS</span><span class="bm-sub">AI-native · agent-first</span></span></div>
      <p>A concept for running a neocloud's whole supply chain — chips, hardware, data center build, SCOR operations and third-party risk — with agents, mandates and a small human team.</p>
      <p class="tiny">Built with the <a class="inline" href="https://github.com/Ethical-Tech-CoLab/project-startup-guide">Ethical Tech CoLab</a> method: think in documents, review with a human, then build.</p></div>
    <div><h5>Explore</h5><a href="index.html">Overview</a><a href="simulate.html">Agentic simulation</a><a href="negotiate.html">Negotiation room</a><a href="method.html">Method &amp; limits</a><a href="providers.html">Risk provider kit</a><a href="brand.html">Brand kit</a></div>
    <div><h5>Documents</h5><a href="${REPO}/blob/main/CONCEPT-IDEA.md">CONCEPT-IDEA.md</a><a href="${REPO}/blob/main/SPECIFICATION.md">SPECIFICATION.md</a><a href="${REPO}">Repository</a></div>
    <div><h5>Lineage</h5><a href="https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation">CoLab 3D agentic simulation</a><a href="https://github.com/Ethical-Tech-CoLab/diplomatic-simulator">CoLab diplomatic simulator</a><a href="https://github.com/Ethical-Tech-CoLab/diplomacy-table-live">Diplomacy Table (DTSF)</a><a href="https://github.com/Ethical-Tech-CoLab/website">CoLab design system</a></div>
  </div>
  <p class="tiny" style="margin-top:34px;opacity:.8">Notional demo. Every supplier, site, quantity and event in the simulations is synthetic; no <span data-risk-name></span> data is included — risk signals are simulated in the provider's documented categories, or in generic ones where none are public. Brand names belong to their owners.</p></div>`;
}

function renderBrandList() {
  const list = document.getElementById('brandList');
  if (!list) return;
  const cur = currentBrand()?.id;
  const brands = allBrands();
  list.innerHTML = Object.entries(brands).map(([id, b]) => `
    <button class="brand-opt" role="menuitemradio" aria-checked="${id === cur}" data-brand="${id}">
      <span class="sw"><i style="background:${b.bg}"></i><i style="background:${b.accent}"></i><i style="background:${b.glow || b.accent}"></i></span>
      <span><b>${b.name}</b><small>${b.kind === 'lab' ? 'lab theme' : b.kind === 'custom' ? 'your custom theme' : `${b.ground} · ${b.confidence || 'approx.'} confidence`}</small></span>
      <span class="tiny muted">${id === cur ? '●' : ''}</span>
    </button>`).join('');
}

function renderRiskList() {
  const list = document.getElementById('riskList');
  if (!list) return;
  const cur = currentProvider()?.id;
  list.innerHTML = Object.entries(allProviders()).map(([id, p]) => {
    const c = coverage(p);
    return `<button class="brand-opt risk-opt" role="menuitemradio" aria-checked="${id === cur}" data-risk="${id}">
      <span class="rk-badge" aria-hidden="true">${p.name.slice(0, 2)}</span>
      <span><b>${p.name}</b><small>${p.kind === 'generic' ? 'generic · canonical interface' : p.kind === 'custom' ? 'white-label · canonical interface' : `${c.named}/11 tools named · ${p.confidence}`}</small></span>
      <span class="tiny muted">${id === cur ? '●' : ''}</span>
    </button>`;
  }).join('');
}

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

function initTips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);
  document.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    tip.innerHTML = el.getAttribute('data-tip');
    tip.classList.add('show');
  });
  document.addEventListener('pointermove', e => {
    if (!tip.classList.contains('show')) return;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10);
    const y = Math.min(e.clientY + 16, innerHeight - tip.offsetHeight - 10);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) tip.classList.remove('show'); });
}

export function observeReveals(root = document) {
  const els = root.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  els.forEach(e => io.observe(e));
}

export function mountShell(page) {
  initTheme();
  const nav = document.querySelector('[data-shell="nav"]');
  if (nav) { nav.className = 'nav glass'; nav.innerHTML = navHTML(page); }
  const foot = document.querySelector('[data-shell="footer"]');
  if (foot) { foot.className = 'foot'; foot.innerHTML = footHTML(); }
  applyBrand(currentBrand().id, { persist: false }); // fill the brand-name slots just rendered
  initProvider();

  const pops = [['brandPop', 'brandBtn', renderBrandList], ['riskPop', 'riskBtn', renderRiskList]];
  for (const [popId, btnId, render] of pops) {
    const pop = document.getElementById(popId), btn = document.getElementById(btnId);
    btn?.addEventListener('click', e => {
      e.stopPropagation();
      render();
      for (const [other] of pops) if (other !== popId) document.getElementById(other)?.classList.remove('open');
      pop.classList.toggle('open');
      btn.setAttribute('aria-expanded', pop.classList.contains('open'));
    });
  }
  const closeAll = () => pops.forEach(([id, b]) => { document.getElementById(id)?.classList.remove('open'); document.getElementById(b)?.setAttribute('aria-expanded', 'false'); });
  document.addEventListener('click', e => { if (!e.target.closest('.pop')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  document.getElementById('riskList')?.addEventListener('click', e => {
    const b = e.target.closest('[data-risk]');
    if (!b) return;
    applyProvider(b.dataset.risk);
    const u = new URL(location.href);
    if (b.dataset.risk === 'generiq') u.searchParams.delete('risk'); else u.searchParams.set('risk', b.dataset.risk);
    if (b.dataset.risk !== 'custom') u.searchParams.delete('riskName');
    history.replaceState(null, '', u);
    renderRiskList();
    toast(`Risk signals from ${currentProvider().name}`);
  });
  document.getElementById('brandList')?.addEventListener('click', e => {
    const b = e.target.closest('[data-brand]');
    if (!b) return;
    applyBrand(b.dataset.brand);
    const u = new URL(location.href);
    if (b.dataset.brand === 'colab') u.searchParams.delete('brand'); else u.searchParams.set('brand', b.dataset.brand);
    history.replaceState(null, '', u);
    renderBrandList();
    toast(`Dressed as ${currentBrand().name}`);
  });
  document.getElementById('navToggle')?.addEventListener('click', () => nav.classList.toggle('open'));

  document.addEventListener('pointermove', e => {
    const c = e.target.closest?.('.card-glow');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    c.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
  initTips();
  observeReveals();
}
