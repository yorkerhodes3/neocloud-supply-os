import { mountShell, observeReveals, toast } from '../shell.js';
import { BRANDS, derive, SANS, MONO } from '../themes.js';
import { applyBrand, currentBrand, saveCustom, loadCustom } from '../theme.js';
import { contrast, over, parse, hex } from '../lib/color.js';
import { esc } from '../lib/md.js';

mountShell('brand');
const $ = (s, r = document) => r.querySelector(s);

const SANS_FAMILIES = ['Inter', 'Plus Jakarta Sans', 'Space Grotesk', 'DM Sans', 'Manrope', 'IBM Plex Sans', 'Geist', 'Archivo', 'Instrument Sans', 'Figtree', 'Outfit', 'Sora', 'Poppins', 'Montserrat', 'Red Hat Display', 'Onest', 'Roboto'];
const MONO_FAMILIES = ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Roboto Mono', 'Geist Mono'];
const DISPLAY_FAMILIES = ['Bebas Neue', ...SANS_FAMILIES];
const family = (stack) => /^"([^"]+)"/.exec(stack || '')?.[1] || 'Inter';
const stackFor = (f) => f === 'Bebas Neue' ? '"Bebas Neue", Impact, sans-serif' : MONO_FAMILIES.includes(f) ? MONO(f) : SANS(f);
const styleOf = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${String(v).replace(/"/g, '&quot;')}`).join(';');
const isColour = (v) => /^#|^rgba?\(/.test(v);
const slug = (s) => String(s || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
const KIND = { lab: 'Lab theme', neocloud: 'Neocloud preset', 'ai-lab': 'AI-lab preset', custom: 'Your theme' };

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
  catch { $('#importBox').hidden = false; $('#importText').value = text; $('#importText').select(); toast(`${what} is in the import box; copy it from there`); }
}

// ---------- 01 Gallery ----------
function renderGallery() {
  const cur = currentBrand()?.id;
  const custom = loadCustom();
  const list = Object.entries(BRANDS).concat(custom ? [['custom', custom]] : []);
  $('#brandGrid').innerHTML = list.map(([id, b], i) => {
    const v = derive(b);
    const q = id === 'colab' ? '' : `?brand=${id}`;
    return `<article class="bcard reveal ${['', 'd1', 'd2'][i % 3]}" style="${styleOf(v)}" data-id="${id}" ${id === cur ? 'aria-current="true"' : ''}>
      <div class="bc-top"><span class="bc-kind">${KIND[b.kind] || KIND.neocloud}</span>${b.kind === 'custom' ? '' : `<span class="badge ${b.confidence === 'high' ? 'ok' : b.confidence === 'low' ? 'risk' : 'warn'}" title="How closely the preset is sourced">${esc(b.confidence)} confidence</span>`}</div>
      <h3>${esc(b.name)}</h3>
      <p class="bc-sample">Contract to capacity. <span class="display-em">Run by agents.</span></p>
      <div class="bc-sw" aria-hidden="true">${['--bg', '--surface', '--card', '--accent', '--glow', '--glow-2', '--s3', '--s4'].map(k => `<i style="background:${v[k]}"></i>`).join('')}</div>
      <p class="bc-style">${esc(b.style || '')}</p>
      <div class="bc-ui" aria-hidden="true"><span class="btn primary sm">Run</span><span class="chip on">Native</span><span class="chip">Legacy</span><span class="badge ok">ok</span><span class="badge warn">warn</span><span class="badge risk">risk</span></div>
      <dl class="bc-meta"><dt>Type</dt><dd>${esc(family(b.fontDisplay))} / ${esc(family(b.fontBody))}</dd>${b.fontNote ? `<dt>Note</dt><dd>${esc(b.fontNote)}</dd>` : ''}</dl>
      <div class="bc-actions">
        <button class="btn sm ${id === cur ? '' : 'primary'}" type="button" data-apply="${id}">${id === cur ? 'Active' : 'Apply'}</button>
        <a class="btn sm ghost" href="simulate.html${q}">Simulation</a><a class="btn sm ghost" href="negotiate.html${q}">Negotiation</a>
      </div>
      ${b.sources?.length ? `<details class="bc-src"><summary>Sources (${b.sources.length})</summary>${b.sources.map(s => `<a href="${esc(s)}" rel="noopener">${esc(s.replace(/^https:\/\/(www\.)?/, ''))}</a>`).join('')}</details>` : ''}
    </article>`;
  }).join('');
  observeReveals($('#brandGrid'));
}
$('#brandGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-apply]'); if (!b) return;
  const id = b.dataset.apply;
  applyBrand(id);
  const u = new URL(location.href);
  if (id === 'colab' || id === 'custom') u.searchParams.delete('brand'); else u.searchParams.set('brand', id);
  history.replaceState(null, '', u);
  toast(`${currentBrand().name} applied across the site`);
});

// ---------- 02 Tokens & checks ----------
function checksFor(v) {
  const bg = v['--bg'], card = over(v['--card'], bg);
  return [
    ['Body text on the ground', contrast(v['--fg'], bg), 7, 'AAA'],
    ['Body text on cards', contrast(v['--fg'], card), 7, 'AAA'],
    ['Muted text on the ground', contrast(v['--muted'], bg), 4.5, 'AA'],
    ['Muted text on cards', contrast(v['--muted'], card), 4.5, 'AA'],
    ['Accent on the ground (UI, large type)', contrast(v['--accent'], bg), 3, 'AA UI'],
    ['Button text on the accent', contrast(v['--accent-ink'], v['--accent']), 4.5, 'AA'],
    ...['--ok', '--warn', '--risk', '--info'].map(k => [`Status ${k.slice(2)} on the ground`, contrast(v[k], bg), 3, 'AA UI']),
  ];
}
const checksHTML = (v) => checksFor(v).map(([label, r, min, lvl]) => `
  <div class="check ${r >= min ? 'pass' : 'fail'}"><span>${esc(label)}</span><b class="mono">${r.toFixed(2)}:1</b><span class="badge ${r >= min ? 'ok' : 'risk'}">${r >= min ? '✓' : '✗'} ${lvl} ≥ ${min}</span></div>`).join('');

function renderTokens() {
  const b = currentBrand(); if (!b) return;
  const v = b.vars;
  $('#checks').innerHTML = checksHTML(v);
  $('#tokTable tbody').innerHTML = Object.entries(v).map(([k, val]) => `<tr><td class="mono">${k}</td><td class="mono">${isColour(val) ? `<i class="tok-sw" style="background:${val}"></i>` : ''}${esc(val)}</td></tr>`).join('');
  $('#typeSpec').innerHTML = `
    <div class="ts-row"><span class="k">Display · ${esc(family(v['--font-display']))} ${esc(v['--display-weight'])}</span><p class="ts-display">Signal to protective action in under an hour.</p></div>
    <div class="ts-row"><span class="k">Body · ${esc(family(v['--font-body']))}</span><p class="ts-body">The Screener desk re-screened Lumen Optics against the updated list and held two payments. A human confirms the hold within the hour.</p></div>
    <div class="ts-row"><span class="k">Mono · ${esc(family(v['--font-mono']))}</span><p class="ts-mono">PO-20417 · ACK 00:42 · 8 × 72 GPU · $3.4M</p></div>`;
}
const cssOf = (v, sel = ':root') => `${sel} {\n${Object.entries(v).map(([k, val]) => `  ${k}: ${val};`).join('\n')}\n}\n`;
$('#copyCss').addEventListener('click', () => copy(cssOf(currentBrand().vars), 'CSS'));

// ---------- 03 Builder ----------
const F = $('#builderForm');
let S = null;

const COLOURS = ['bg', 'fg', 'accent', 'glow', 'glow2'];
const toHex = (c, fb) => { try { return hex(parse(c)); } catch { return fb; } };
function fromBrand(b) {
  const upper = b.displayCase === 'uppercase';
  return {
    name: b.kind === 'custom' ? b.name : `${b.short || b.name} custom`,
    ground: b.ground === 'light' ? 'light' : 'dark',
    bg: toHex(b.bg, '#0b0b0f'), fg: toHex(b.fg, '#f5f5f7'), accent: toHex(b.accent, '#c6f432'),
    glow: toHex(b.glow || b.accent, '#8b5cf6'), glow2: toHex(b.glow2 || derive(b)['--glow-2'], '#38bdf8'),
    ink: ['#ffffff', '#0b0b0f'].includes(b.accentInk) ? b.accentInk : b.accentInk ? (contrast(b.accentInk, '#ffffff') < 2 ? '#ffffff' : '#0b0b0f') : 'auto',
    fontDisplay: family(b.fontDisplay), fontBody: family(b.fontBody), fontMono: family(b.fontMono || '"JetBrains Mono"'),
    displayWeight: String(b.displayWeight || 600), upper,
    radius: b.radius?.md ?? 14, pill: b.radius?.pill !== false,
    // Type metrics the form does not expose; kept while the case setting matches the source.
    base: { upper, displayTracking: b.displayTracking, displayLeading: b.displayLeading, bodySize: b.bodySize, bodyLeading: b.bodyLeading, grain: b.grain },
  };
}
function toTheme(s) {
  const r = +s.radius, keep = s.base && s.base.upper === s.upper ? s.base : {};
  const t = {
    name: s.name || 'Custom', short: (s.name || 'Custom').split(/\s+/)[0], product: (s.name || 'Custom').replace(/\s+custom$/i, ''),
    kind: 'custom', ground: s.ground, bg: s.bg, fg: s.fg, accent: s.accent, glow: s.glow, glow2: s.glow2,
    fontDisplay: stackFor(s.fontDisplay), fontBody: stackFor(s.fontBody), fontMono: MONO(s.fontMono),
    displayCase: s.upper ? 'uppercase' : 'none', displayTracking: keep.displayTracking || (s.upper ? '0.02em' : '-0.03em'),
    displayWeight: +s.displayWeight, displayLeading: keep.displayLeading || (s.upper ? 0.92 : 1.0),
    bodySize: keep.bodySize || (MONO_FAMILIES.includes(s.fontBody) ? '14.5px' : '15px'),
    radius: { sm: Math.round(r * 0.55), md: r, lg: Math.round(r * 1.55), pill: s.pill },
    style: 'Custom theme built on the brand kit page.', confidence: 'high', sources: [location.origin + location.pathname],
  };
  if (s.ink !== 'auto') t.accentInk = s.ink;
  if (keep.bodyLeading) t.bodyLeading = keep.bodyLeading;
  if (keep.grain != null) t.grain = keep.grain;
  return t;
}

const opts = (list, sel) => list.map(f => `<option ${f === sel ? 'selected' : ''}>${esc(f)}</option>`).join('');
function fillForm() {
  F.name.value = S.name;
  for (const k of COLOURS) { F[k].value = S[k]; F[`${k}Hex`].value = S[k]; }
  F.ink.value = S.ink;
  F.fontDisplay.innerHTML = opts(DISPLAY_FAMILIES, S.fontDisplay);
  F.fontBody.innerHTML = opts([...SANS_FAMILIES, ...MONO_FAMILIES], S.fontBody);
  F.fontMono.innerHTML = opts(MONO_FAMILIES, S.fontMono);
  F.displayWeight.value = S.displayWeight;
  F.upper.checked = S.upper; F.pill.checked = S.pill; F.radius.value = S.radius;
  F.querySelectorAll('[data-ground]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ground === S.ground)));
  updatePreview();
}

$('#startFrom').innerHTML = Object.entries(BRANDS).map(([id, b]) => `<option value="${id}">Start from ${esc(b.name)}</option>`).join('') + (loadCustom() ? '<option value="custom">Start from my saved theme</option>' : '');
$('#startFrom').addEventListener('change', e => { S = fromBrand(e.target.value === 'custom' ? loadCustom() : BRANDS[e.target.value]); fillForm(); });

F.addEventListener('input', e => {
  const t = e.target, n = t.name;
  if (!n) return;
  if (COLOURS.includes(n)) { S[n] = t.value; F[`${n}Hex`].value = t.value; }
  else if (n.endsWith('Hex')) {
    const k = n.slice(0, -3), m = /^#?([0-9a-f]{6})$/i.exec(t.value.trim());
    t.setAttribute('aria-invalid', String(!m));
    if (!m) return;
    S[k] = `#${m[1].toLowerCase()}`; F[k].value = S[k];
  } else if (t.type === 'checkbox') S[n] = t.checked;
  else if (n === 'radius') S.radius = +t.value;
  else S[n] = t.value;
  updatePreview();
});
F.addEventListener('click', e => {
  const g = e.target.closest('[data-ground]'); if (!g) return;
  if (S.ground !== g.dataset.ground) {
    S.ground = g.dataset.ground;
    [S.bg, S.fg] = [S.fg, S.bg]; // flip the pair so the switch gives a usable starting point
  }
  fillForm();
});
F.addEventListener('submit', e => e.preventDefault());

const PREVIEW = `
  <div class="pv-nav"><span class="pv-mark"></span><b class="pv-name"></b><span class="spacer"></span><span class="chip">Simulation</span><span class="chip on">Negotiation</span></div>
  <div class="pv-hero"><span class="eyebrow">Concept demo</span><h3 class="pv-h">Contract to capacity. <span class="display-em">Run by agents.</span></h3>
    <p class="pv-lede">One graph, one ledger and a fleet of mandated agents across chips, hardware, data center build and third-party risk.</p>
    <div class="row wrap-row"><span class="btn primary sm">Run the simulation →</span><span class="btn sm">Negotiation room</span></div></div>
  <div class="pv-cards">
    <div class="card"><span class="k">Scoreboard · day 131</span><div class="pv-kpi"><div><b>9,216</b><span>GPUs billable · native</span></div><div><b class="muted">4,608</b><span>legacy</span></div></div><div class="pv-bar"><i style="width:100%"></i><i style="width:50%"></i></div></div>
    <div class="card"><span class="k">Decision · Screener</span><p class="pv-p">Hold two payments to Lumen Optics after an ownership-chain designation?</p><div class="row wrap-row"><span class="badge risk">sanctions</span><span class="badge warn">2 payments</span><span class="badge ok">mandate ok</span></div></div>
  </div>`;
function updatePreview() {
  const t = toTheme(S), v = derive(t), pv = $('#preview');
  if (!pv.firstElementChild) pv.innerHTML = PREVIEW;
  pv.setAttribute('style', styleOf(v));
  pv.querySelector('.pv-name').textContent = `${t.product} Supply OS`;
  $('#radiusOut').textContent = `${S.radius}px`;
  $('#previewChecks').innerHTML = checksHTML(v);
  const notes = [];
  if (v['--accent'].toLowerCase() !== S.accent.toLowerCase()) notes.push(`The accent was adjusted from ${S.accent} to ${v['--accent']} so it reaches 3:1 on the ground and 4.5:1 under button text. Swatches and glows keep your original.`);
  if (contrast(S.fg, S.bg) < 7) notes.push('Text and background are below 7:1. Pick a darker or lighter pair before using this theme for long reading.');
  $('#adjustNote').textContent = notes.join(' ');
}

$('#applyCustom').addEventListener('click', () => {
  const t = toTheme(S);
  saveCustom(t);
  applyBrand('custom', { theme: t });
  const u = new URL(location.href); u.searchParams.delete('brand'); history.replaceState(null, '', u);
  toast('Applied. Custom themes live in this browser; export JSON to share one.');
});
$('#exportJson').addEventListener('click', () => {
  const t = toTheme(S); delete t.kind;
  copy(`${JSON.stringify({ [slug(S.name)]: t }, null, 2)}\n`, 'JSON');
});
$('#exportCss').addEventListener('click', () => copy(cssOf(derive(toTheme(S)), `[data-brand="${slug(S.name)}"]`), 'CSS'));
$('#importToggle').addEventListener('click', () => { const b = $('#importBox'); b.hidden = !b.hidden; if (!b.hidden) $('#importText').focus(); });
$('#importGo').addEventListener('click', () => {
  try {
    let o = JSON.parse($('#importText').value);
    if (o && !o.bg && Object.keys(o).length === 1) o = Object.values(o)[0];
    if (!o || typeof o !== 'object') throw new Error('not a theme object');
    for (const k of ['bg', 'fg', 'accent']) parse(o[k]);
    S = fromBrand({ ...o, kind: 'custom', name: String(o.name || 'Imported').slice(0, 40) });
    fillForm();
    toast('Theme loaded into the builder');
  } catch (err) { toast(`Could not read that theme: ${err.message}`); }
});

// ---------- 04 Flow ----------
const FLOW = [
  ['1 · Declare', 'A brand is one entry in <code>BRANDS</code> (themes.js): ground, background, text, accent, glow, three typefaces, radius, plus sources and a confidence rating.'],
  ['2 · Derive', '<code>derive()</code> expands it into every variable the system uses: surfaces, borders, muted text, status and series colours, map colours. It nudges the accent until contrast passes.'],
  ['3 · Apply', '<code>applyBrand()</code> sets the variables on <code>:root</code>, caches them for a flash-free first paint, and fires a <code>themechange</code> event.'],
  ['4 · Repaint', 'CSS follows on its own. The deck.gl globe, the campus view and the charts listen for <code>themechange</code> and re-read the variables. <code>?brand=id</code> travels with every internal link.'],
];
$('#flow').innerHTML = FLOW.map(([h, p], i) => `<article class="card reveal ${['', 'd1', 'd2', 'd3'][i]}"><span class="k">${esc(h)}</span><p class="small" style="margin:10px 0 0">${p}</p></article>`).join('');

// ---------- boot ----------
function syncAll() { renderGallery(); renderTokens(); }
window.addEventListener('themechange', syncAll);
S = fromBrand(currentBrand());
$('#startFrom').value = BRANDS[currentBrand().id] ? currentBrand().id : (loadCustom() ? 'custom' : 'colab');
fillForm();
syncAll();
observeReveals();
