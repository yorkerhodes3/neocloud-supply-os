import { mountShell, observeReveals, toast } from '../shell.js';
import { CAPABILITIES, SIGNALS, BASIS, CHECKED, PROVIDERS, tool, chain, coverage, factors } from '../providers.js';
import { allProviders, applyProvider, currentProvider, saveLabel, loadLabel } from '../risk.js';
import { esc } from '../lib/md.js';

mountShell('providers');
const $ = (s, r = document) => r.querySelector(s);

const SUP = {
  full: { label: 'full', cls: 'ok', tip: 'Documented or announced as a direct capability.' },
  partial: { label: 'partial', cls: 'warn', tip: 'Covers part of the need; the note says what is missing.' },
  unknown: { label: 'unknown', cls: 'l1', tip: 'Not enough public information to say.' },
  gap: { label: 'gap', cls: 'risk', tip: 'Not offered; the registry names the fallback.' },
};
const SCREEN = [['search_entities', '"Lumen Optics", TW'], ['get_entity', 'id'], ['get_ownership', 'depth 3'], ['screen_entity', 'id']];
const KIND = { generic: 'Generic provider', vendor: 'Vendor', custom: 'White label' };

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
  catch { toast(`Could not reach the clipboard; select the text below instead`); }
}

const basisMark = (b) => `<span class="marker rp-basis b-${b}" data-tip="${esc(BASIS[b].tip)}">${esc(BASIS[b].label)}</span>`;
const supBadge = (s) => `<span class="badge ${SUP[s].cls}" data-tip="${esc(SUP[s].tip)}">${SUP[s].label}</span>`;

// ---------- 01 Registry ----------
function renderGrid() {
  const cur = currentProvider()?.id;
  $('#rpGrid').innerHTML = Object.entries(allProviders()).map(([id, p], i) => {
    const c = coverage(p);
    const bar = ['full', 'partial', 'unknown', 'gap'].map(k => c[k] ? `<i class="s-${k}" style="flex:${c[k]}" title="${c[k]} ${k}"></i>` : '').join('');
    return `<article class="card rp-card reveal ${['', 'd1', 'd2'][i % 3]}" data-id="${id}" ${id === cur ? 'aria-current="true"' : ''}>
      <div class="rp-top"><span class="k">${KIND[p.kind] || 'Provider'}</span>${p.fictional || p.kind === 'custom' ? '<span class="badge l1">fictional</span>' : ''}</div>
      <h3>${esc(p.name)}</h3>
      <p class="small muted rp-focus">${esc(p.focus)}</p>
      <div class="rp-bar" role="img" aria-label="${c.full} full, ${c.partial} partial, ${c.unknown} unknown, ${c.gap} gap of ${CAPABILITIES.length}">${bar}</div>
      <dl class="rp-meta">
        <dt>Named tools</dt><dd>${c.named} of ${CAPABILITIES.length}</dd>
        <dt>MCP</dt><dd>${esc(p.channel?.mcp || '—')}</dd>
        <dt>API</dt><dd>${esc(p.channel?.api || '—')}</dd>
        <dt>Confidence</dt><dd>${esc(p.confidence || '—')}</dd>
      </dl>
      ${p.notes?.length ? `<details class="rp-notes"><summary>Field notes (${p.notes.length})</summary><ul>${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      ${p.sources?.length ? `<details class="rp-notes"><summary>Sources</summary>${p.sources.map(s => `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a>`).join('')}</details>` : ''}
      <div class="rp-actions">
        <button class="btn sm ${id === cur ? '' : 'primary'}" type="button" data-apply="${id}" ${id === cur ? 'aria-pressed="true"' : ''}>${id === cur ? 'In use' : 'Use for the demo'}</button>
        <a class="btn sm ghost" href="simulate.html?risk=${id}${id === 'custom' ? `&riskName=${encodeURIComponent(p.name)}` : ''}">Simulate →</a>
      </div>
    </article>`;
  }).join('');
  observeReveals($('#rpGrid'));
}
$('#rpGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-apply]'); if (!b) return;
  setProvider(b.dataset.apply);
});
function setProvider(id) {
  const u = new URL(location.href);
  if (id === 'generiq') u.searchParams.delete('risk'); else u.searchParams.set('risk', id);
  if (id !== 'custom') u.searchParams.delete('riskName');
  history.replaceState(null, '', u);
  applyProvider(id);
  toast(`Risk signals from ${currentProvider().name}`);
}

$('#supportLegend').innerHTML = Object.keys(SUP).map(k => `${supBadge(k)} <span class="small muted">${esc(SUP[k].tip)}</span>`).join('');
$('#checked').textContent = CHECKED;

// ---------- 02 Capability matrix ----------
function cell(p, cap) {
  const t = tool(p, cap);
  if (t.support === 'gap') return `<td class="gapcell"><span class="small">no native call</span><span class="rp-fb">→ ${esc(t.fallback || 'second source')}</span>${t.note ? `<span class="rp-note">${esc(t.note)}</span>` : ''}</td>`;
  return `<td class="${t.stand ? 'is-stand' : ''}"><code class="${t.stand ? 'stand-in' : ''}">${esc(t.shown)}</code>
    <span class="rp-tags">${basisMark(t.basis)}${t.support !== 'full' ? supBadge(t.support) : ''}${t.via === 'api' && t.basis !== 'canonical' ? '<span class="marker">API</span>' : ''}</span>
    ${t.path ? `<span class="rp-note mono">${esc(t.path)}</span>` : t.api && t.api !== t.native ? `<span class="rp-note mono">API: ${esc(t.api)}</span>` : ''}
    ${t.note ? `<span class="rp-note">${esc(t.note)}</span>` : ''}</td>`;
}
function renderMatrix() {
  const all = allProviders(), cur = currentProvider()?.id;
  const ids = Object.keys(all);
  const head = `<thead><tr><th>Canonical capability</th>${ids.map(id => `<th class="${id === cur ? 'cur' : ''}">${esc(all[id].name)}</th>`).join('')}</tr></thead>`;
  const body = CAPABILITIES.map(c => `<tr><th scope="row"><code>${c.id}</code><span class="rp-q">${esc(c.q)}</span><span class="rp-note">${esc(c.desks)}</span></th>${ids.map(id => cell(all[id], c.id).replace('<td', `<td${id === cur ? ' data-cur' : ''}`)).join('')}</tr>`).join('');
  const foot = `<tfoot><tr><th>Named natively</th>${ids.map(id => `<td>${coverage(all[id]).named} / ${CAPABILITIES.length}</td>`).join('')}</tr></tfoot>`;
  $('#capMatrix').innerHTML = head + `<tbody>${body}</tbody>` + foot;

  const sh = `<thead><tr><th>Signal</th>${ids.map(id => `<th class="${id === cur ? 'cur' : ''}">${esc(all[id].name)}</th>`).join('')}</tr></thead>`;
  const sb = SIGNALS.map(s => `<tr><th scope="row"><code>${s.id}</code><span class="rp-q">${esc(s.label)}</span></th>${ids.map(id => {
    const f = factors(all[id], s.id);
    return f ? `<td${id === cur ? ' data-cur' : ''}>${f.map(x => `<code class="rp-f">${esc(x)}</code>`).join(' ')}</td>` : `<td class="gapcell"${id === cur ? ' data-cur' : ''}><span class="small">gap</span><span class="rp-fb">→ official lists / second source</span></td>`;
  }).join('')}</tr>`).join('');
  $('#sigMatrix').innerHTML = sh + `<tbody>${sb}</tbody>`;
}
$('#basisLegend').innerHTML = Object.keys(BASIS).map(k => `${basisMark(k)} <span class="small muted">${esc(BASIS[k].tip)}</span>`).join('');

// ---------- 04 Analysis ----------
const FINDINGS = [
  ['Only two publish names', 'Sayari (SDK) and Tradeverifyd (OpenAPI) publish callable names. Resilinc has announced MCP and A2A without a public tool list. Exiger shows no public API, SDK or MCP.'],
  ['Verbs converge, strings do not', 'Both public interfaces say search, resolve, get entity, graph or traverse, shipments and risk factors or flags. Only get_entity matches exactly, and even there one MCP build calls it get_entity_profile.'],
  ['So the standard is the capability', 'Desks call eleven canonical capabilities. The registry maps each one to the native name, tags how we know it, and names a fallback for every gap. GenerIQ is the canonical interface under a neutral name.'],
];
$('#findings').innerHTML = FINDINGS.map(([h, p], i) => `<article class="card reveal ${['', 'd1', 'd2'][i]}"><span class="k">Finding ${i + 1}</span><h3>${esc(h)}</h3><p class="small" style="margin:0">${esc(p)}</p></article>`).join('');

const sy = PROVIDERS.sayari, tv = PROVIDERS.tradeverifyd;
const pub = (t) => t.support === 'gap' ? '<span class="muted">—</span>' : `<code>${esc(t.api || t.native)}</code>`;
$('#sideBySide').innerHTML = `<thead><tr><th>Capability</th><th>Sayari SDK</th><th>Tradeverifyd OpenAPI</th></tr></thead><tbody>${
  CAPABILITIES.map(c => `<tr><td><code>${c.id}</code></td><td>${pub(sy.tools[c.id])}</td><td>${pub(tv.tools[c.id])}</td></tr>`).join('')}</tbody>`;

function renderChains() {
  const all = allProviders(), cur = currentProvider()?.id;
  $('#chains').innerHTML = Object.entries(all).map(([id, p]) => `<li${id === cur ? ' class="cur"' : ''}><span class="k">${esc(p.name)}</span><code>${esc(chain(p, SCREEN))}</code></li>`).join('');
  $('#nowChain').textContent = chain(currentProvider(), SCREEN.slice(0, 2));
}

// ---------- 05 Dress and extend ----------
$('#labelName').value = loadLabel();
$('#labelForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#labelName').value.trim().slice(0, 32);
  if (!name) { toast('Type a name first'); return; }
  saveLabel(name);
  const u = new URL(location.href); u.searchParams.delete('riskName'); history.replaceState(null, '', u);
  setProvider('custom');
});
$('#clearLabel').addEventListener('click', () => {
  saveLabel(''); $('#labelName').value = '';
  const u = new URL(location.href); u.searchParams.delete('riskName'); history.replaceState(null, '', u);
  if (currentProvider()?.id === 'custom') setProvider('generiq'); else render();
  toast('White label cleared');
});
$('#copyLink').addEventListener('click', () => {
  const p = currentProvider();
  const u = new URL('simulate.html', location.href);
  if (p.id !== 'generiq') u.searchParams.set('risk', p.id);
  if (p.id === 'custom') u.searchParams.set('riskName', p.name);
  copy(u.href, 'Demo link');
});
function entryJson() {
  const { id, ...p } = currentProvider();
  const tools = Object.fromEntries(Object.entries(p.tools).map(([k, t]) => [k, Object.fromEntries(Object.entries(t).filter(([, v]) => v != null))]));
  return JSON.stringify({ [id === 'custom' ? p.ns : id]: { name: p.name, short: p.short, ns: p.ns, kind: p.kind, focus: p.focus, channel: p.channel, tools, factors: p.factors } }, null, 2);
}
$('#copyEntry').addEventListener('click', () => copy(entryJson(), 'Registry entry'));
function renderWire() {
  const p = currentProvider();
  const t = tool(p, 'screen_entity');
  $('#entryWire').innerHTML = `<span class="c">// docs/assets/js/providers.js · active: ${esc(p.name)}</span>
<span class="k">${esc(p.ns)}</span>: {
  name: <span class="s">'${esc(p.name)}'</span>, ns: <span class="s">'${esc(p.ns)}'</span>,
  tools: {
    screen_entity: { native: <span class="s">${t.native ? `'${esc(t.native)}'` : 'null'}</span>, basis: <span class="s">'${t.basis}'</span>, support: <span class="s">'${t.support}'</span> },
    <span class="c">// … ten more capabilities</span>
  },
  factors: { sanctions: [${(p.factors.sanctions || []).slice(0, 2).map(x => `<span class="s">'${esc(x)}'</span>`).join(', ')}], <span class="c">/* … */</span> },
}`;
}

function render() { renderGrid(); renderMatrix(); renderChains(); renderWire(); }
render();
window.addEventListener('providerchange', render);
observeReveals(document);
