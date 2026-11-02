// simulate.html: two lockstep runs (agent-native and legacy) over one physical world,
// drawn in 3D, with a scoreboard, ledger, human decision queue, desk wall and timeline.
// Everything that defines a run lives in the URL, so a link reproduces it exactly.
import { mountShell, toast } from '../shell.js';
import { CONCEPT } from '../data/concept.js';
import { Sim, ASSUMPTIONS, REPORT_DAY, fmtLag } from '../sim/engine.js';
import { SCENARIOS, scenarioByN, freshScenario } from '../sim/scenarios.js';
import { SITES, SUPPLIERS, supplier, GPUS_PER_RACK } from '../sim/world.js';
import { createRenderer, webglOK, RACK_STATES } from '../sim/render.js';

mountShell('simulate');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const num = (v, lo, hi, d) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const HORIZON = 240;
const TOTAL_GPUS = SITES.reduce((a, s) => a + s.halls * s.racksPerHall, 0) * GPUS_PER_RACK;
const RUN_NAME = { native: 'Agent-native', legacy: 'Legacy' };

// ---------- configuration (URL is the source of truth) ----------
const Q = new URLSearchParams(location.search);
const cfg = {
  scenario: int(Q.get('scenario'), 0, 16, 0),
  seed: int(Q.get('seed'), 1, 99999, 42),
  policy: Q.get('policy') === 'asap' ? 'asap' : 'jit',
  autonomy: Q.get('autonomy') === 'dayone' ? 'dayone' : 'earned',
  watch: Q.get('watch') === 'legacy' ? 'legacy' : 'native',
  auto: Q.get('auto') !== '0',
  speed: num(Q.get('speed'), 0.25, 12, 3),
  view: Q.get('view') === 'campus' ? 'campus' : 'globe',
  site: SITES.some(s => s.id === Q.get('site')) ? Q.get('site') : 'TX1',
};
const startDay = num(Q.get('t'), 0, HORIZON, 0);
const show = { lanes: true, ships: true, msgs: true, sups: true, risk: true };

function linkURL(withDay = true) {
  const u = new URL(location.href);
  const p = u.searchParams;
  const set = (k, v, def) => (v === def ? p.delete(k) : p.set(k, v));
  set('scenario', String(cfg.scenario), '0');
  p.set('seed', String(cfg.seed));
  set('policy', cfg.policy, 'jit'); set('autonomy', cfg.autonomy, 'earned'); set('watch', cfg.watch, 'native');
  set('auto', cfg.auto ? '1' : '0', '1'); set('speed', String(cfg.speed), '3');
  set('view', cfg.view, 'globe'); set('site', cfg.site, 'TX1');
  if (withDay && T > 0.5) p.set('t', String(Math.round(T))); else p.delete('t');
  u.hash = '';
  return u;
}
const syncURL = () => history.replaceState(null, '', linkURL(false));

// ---------- runs ----------
let sims, proj, T = 0, playing = false;
let choices = [];            // decisions you made by hand: replayed on rewind
let seen;                    // per-run cursors for callouts / decision alerts
let onsetFired = false;

function makeSim(mode, autoResolve) {
  return new Sim({ seed: cfg.seed, mode, scenario: freshScenario(cfg.scenario), autoResolve, policy: cfg.policy, autonomy: cfg.autonomy });
}
function build() {
  sims = { native: makeSim('native', cfg.auto), legacy: makeSim('legacy', true) };
  for (const c of choices) sims[c.mode].at(c.t, () => sims[c.mode].resolve(c.id, c.opt, 'you'));
  seen = { native: { led: 0, dec: 0 }, legacy: { led: 0, dec: 0 } };
  onsetFired = false;
  T = 0;
}
function project() {
  proj = {};
  for (const mode of ['native', 'legacy']) { const s = makeSim(mode, true); s.advanceTo(HORIZON); proj[mode] = s; }
}
function advance(to, { quiet = false } = {}) {
  sims.native.advanceTo(to);
  sims.legacy.advanceTo(to);
  const prev = T;
  T = to;
  // scenario onset: fly the camera there
  const at = sims.native.scenario?.at;
  if (!onsetFired && at != null && T >= at) {
    onsetFired = true;
    if (!quiet && prev <= at + 1) {
      const sc = scenarioByN(cfg.scenario);
      R?.flyTo(sc.focus);
      callout({ sev: 'risk', tag: 'Disruption', t: at, html: `<b>${esc(sc.title)}</b>. ${esc(firstSentence(sc.model))}` });
    }
  }
  if (quiet) { syncSeen(); return; }
  harvest();
}
function seek(to) {
  to = Math.max(0, Math.min(HORIZON, to));
  if (to + 1e-9 < sims.native.t) { build(); }
  advance(to, { quiet: true });
  dirty = 'all';
}
function restart({ keepChoices = false, keepDay = false } = {}) {
  const day = T;
  if (!keepChoices) choices = [];
  build(); project();
  renderMarks(); renderBrief(); renderSiteSeg();
  if (keepDay && day > 0) advance(day, { quiet: true });
  dirty = 'all';
  syncURL();
  scheduleClaims();
}

// ---------- callouts ----------
const calloutsEl = $('#callouts');
function callout({ sev = 'info', tag, t, html, ms = 5200 }) {
  const el = document.createElement('div');
  el.className = `callout ${sev}`;
  el.innerHTML = `<span class="tag">${esc(tag)}</span><div>${html}</div><time>${dayLabel(t ?? T)}</time>`;
  calloutsEl.prepend(el);
  while (calloutsEl.children.length > 3) calloutsEl.lastElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, ms);
}
const firstSentence = (s) => (String(s).match(/^.*?[.!?](\s|$)/) || [s])[0].trim();
function syncSeen() {
  for (const m of ['native', 'legacy']) { seen[m].led = sims[m].ledger.length; seen[m].dec = sims[m].decisions.length; }
}
/** Turn new ledger entries in the watched run into callouts; pause for your decisions. */
function harvest() {
  const run = sims[cfg.watch];
  const fresh = run.ledger.slice(seen[cfg.watch].led);
  const pick = fresh.filter(e => /^Detected:/.test(e.text) || e.sev === 'risk' || (e.kind === 'decision' && !e.human) || /READY for racks|energised|All \d+ racks billable/.test(e.text));
  for (const e of pick.slice(-2)) {
    const det = /^Detected:/.test(e.text);
    const tag = det ? (cfg.watch === 'native' ? 'Detected' : 'Noticed') : e.kind === 'decision' ? 'Needs a human' : e.sev === 'ok' ? 'Milestone' : 'Risk';
    callout({ sev: det ? 'warn' : e.kind === 'decision' ? 'human' : e.sev === 'ok' ? 'ok' : 'risk', tag, t: e.t, html: `<b>${esc(e.desk)}</b> ${esc(e.text)}` });
  }
  const nd = sims.native.decisions.length;
  if (nd > seen.native.dec && !cfg.auto && sims.native.decisions.some(d => d.status === 'open')) {
    setPlaying(false);
    selectTab('decisions');
    if (cfg.watch !== 'native') callout({ sev: 'human', tag: 'Your call', html: 'The agent-native run escalated a decision to you. Switch to the Decisions tab.' });
  }
  if (T >= HORIZON - 1e-6 && playing) { setPlaying(false); endOfRun(); }
  syncSeen();
}
function endOfRun() {
  const kn = sims.native.kpis(REPORT_DAY), kl = sims.legacy.kpis(REPORT_DAY);
  callout({ sev: 'ok', tag: 'Run complete', ms: 9000, html: `By day ${REPORT_DAY}: agent-native earned <b>$${kn.revenueM.toFixed(1)}M</b> (all billable ${kn.allLive != null ? 'day ' + Math.round(kn.allLive) : 'not yet'}); legacy <b>$${kl.revenueM.toFixed(1)}M</b> (${kl.allLive != null ? 'day ' + Math.round(kl.allLive) : 'not all billable'}).` });
}

// ---------- clock & timeline ----------
function dayLabel(t) { const d = Math.floor(t), h = Math.floor((t - d) * 24), m = Math.floor(((t - d) * 24 - h) * 60); return `D${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
const scrub = $('#scrub');
const knob = document.createElement('div'); knob.className = 'tl-knob'; $('#timeline').appendChild(knob);
function renderClock() {
  const d = Math.floor(T), h = Math.floor((T - d) * 24), m = Math.floor(((T - d) * 24 - h) * 60);
  $('#day').textContent = `Day ${d}`;
  $('#clockSub').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · of ${HORIZON}`;
  const pct = (T / HORIZON) * 100;
  $('#tlFill').style.width = `${pct}%`;
  knob.style.left = `${pct}%`;
  if (document.activeElement !== scrub) scrub.value = String(T);
  $('#scoreDay').textContent = String(d);
}
function renderMarks() {
  const sc = scenarioByN(cfg.scenario);
  const pct = (t) => `${(t / HORIZON) * 100}%`;
  const marks = [];
  for (const s of SITES) for (const nb of s.needBy) marks.push(`<span class="m needby" style="left:${pct(nb)}" title="${s.name} need-by day ${nb}"></span>`);
  for (const s of sims.native.sites) marks.push(`<span class="m power" style="left:${pct(s.utilityAt)}" title="${s.name} utility energisation day ${Math.round(s.utilityAt)}"></span>`);
  const at = sims.native.scenario?.at ?? proj.native.scenario?.at;
  if (at != null) marks.push(`<span class="m onset" style="left:${pct(at)}" title="Onset: ${esc(sc.title)}"></span><span class="lbl" style="left:${pct(at)}">S${sc.n}</span>`);
  for (const [m, cls] of [['native', 'det-n'], ['legacy', 'det-l']]) for (const d of proj[m].detections) marks.push(`<span class="m ${cls}" style="left:${pct(Math.max(0, d.detectedAt))}" title="${RUN_NAME[m]} detects (${fmtLag(d.lag)})"></span>`);
  $('#marks').innerHTML = marks.join('');
}

// ---------- scoreboard ----------
const ROWS = [
  { k: 'GPUs billable', f: k => k.gpusLive, fmt: v => v.toLocaleString('en-US'), better: 1, hero: true },
  { k: 'First rack billable', f: k => k.firstLive, fmt: v => (v == null ? '—' : `day ${Math.round(v)}`), better: -1 },
  { k: 'All 128 racks billable', f: k => k.allLive, fmt: v => (v == null ? '—' : `day ${Math.round(v)}`), better: -1 },
  { k: 'Dock → billable (median)', f: k => k.d2bMedian, fmt: v => (v == null ? '—' : `${v.toFixed(0)} d`), better: -1 },
  { k: 'Late rack-days vs need-by', f: k => k.lateRackDays, fmt: v => Math.round(v).toLocaleString('en-US'), better: -1 },
  { k: 'Idle capital (depreciation)', f: k => k.idleCostM, fmt: v => `$${v.toFixed(1)}M`, better: -1 },
  { k: 'Revenue earned', f: k => k.revenueM, fmt: v => `$${v.toFixed(1)}M`, better: 1 },
  { k: 'Premium · tariff · expedite', f: k => k.premiumM + k.tariffM + k.expediteM, fmt: v => `$${v.toFixed(1)}M`, better: -1 },
  { k: 'Human touches', f: k => k.humanTouches, fmt: v => v.toLocaleString('en-US'), better: -1, tip: 'Agent-native: escalations plus approvals. Legacy: every ledger entry is a person doing the work.' },
  { k: 'Detection lag', f: k => k.detection, fmt: v => (v == null ? '—' : fmtLag(v)), better: -1 },
  { k: 'Compliance exposure', f: k => k.exposure, fmt: v => String(v), better: -1, tip: 'Purchase orders or payments to a party after a designation in its ownership chain.' },
];
function delta(r, a, b) {
  if (a == null && b == null) return ['', 'even'];
  if (a == null) return ['—', r.better < 0 ? 'bad' : 'even'];
  if (b == null) return ['✓', r.better < 0 ? 'good' : 'even'];
  const d = a - b;
  if (Math.abs(d) < 1e-6) return ['=', 'even'];
  const good = Math.sign(d) === Math.sign(r.better);
  const s = r.fmt(Math.abs(d)).replace(/^day /, '');
  return [`${d > 0 ? '+' : '−'}${s}${/day/.test(r.fmt(1)) ? ' d' : ''}`, good ? 'good' : 'bad'];
}
function renderScore() {
  const kn = sims.native.kpis(T), kl = sims.legacy.kpis(T);
  $('#kpi').innerHTML = `<thead><tr><th>at day ${Math.floor(T)}</th><th>Native</th><th>Legacy</th><th>Δ</th></tr></thead><tbody>${ROWS.map(r => {
    const a = r.f(kn), b = r.f(kl), [dv, dc] = delta(r, a, b);
    return `<tr class="${r.hero ? 'kpi-top' : ''}"${r.tip ? ` data-tip="${esc(r.tip)}"` : ''}><td>${r.k}</td><td class="n">${r.fmt(a)}</td><td class="l">${r.fmt(b)}</td><td class="d ${dc}">${dv}</td></tr>`;
  }).join('')}</tbody>`;
}
function renderChart() {
  const W = 380, H = 170, PADL = 26, PADB = 14, PADT = 6;
  const x = (d) => PADL + (d / HORIZON) * (W - PADL - 4);
  const y = (g) => PADT + (1 - g / TOTAL_GPUS) * (H - PADB - PADT);
  const path = (series, upto = Infinity) => {
    let p = '';
    for (const s of series) { if (s.d > upto) break; p += `${p ? 'L' : 'M'}${x(s.d).toFixed(1)},${y(s.gpus).toFixed(1)}`; }
    return p;
  };
  const area = (series) => { const p = path(series, T); if (!p) return ''; const last = series.filter(s => s.d <= T).pop(); return `${p}L${x(last.d).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`; };
  const nb = SITES.flatMap(s => s.needBy);
  const at = sims.native.scenario?.at;
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<line class="grid" x1="${PADL}" x2="${W}" y1="${y(TOTAL_GPUS * f)}" y2="${y(TOTAL_GPUS * f)}"/>`).join('');
  const xt = [0, 60, 120, 180, 240].map(d => `<text x="${x(d)}" y="${H - 2}" text-anchor="middle">${d}</text>`).join('');
  $('#chart').innerHTML = `${grid}
    <line class="ax" x1="${PADL}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
    <text x="${PADL - 4}" y="${y(TOTAL_GPUS) + 3}" text-anchor="end">${(TOTAL_GPUS / 1000).toFixed(1)}k</text><text x="${PADL - 4}" y="${y(0)}" text-anchor="end">0</text>${xt}
    ${nb.map(d => `<line class="needby" x1="${x(d)}" x2="${x(d)}" y1="${PADT}" y2="${y(0)}"/>`).join('')}
    ${at != null ? `<line class="onset" x1="${x(at)}" x2="${x(at)}" y1="${PADT}" y2="${y(0)}"/>` : ''}
    <path class="area" d="${area(sims.native.series)}"/>
    <path class="pl" d="${path(proj.legacy.series)}"/><path class="pn" d="${path(proj.native.series)}"/>
    <path class="ll" d="${path(sims.legacy.series, T)}"/><path class="ln" d="${path(sims.native.series, T)}"/>
    <line class="now" x1="${x(T)}" x2="${x(T)}" y1="${PADT}" y2="${y(0)}"/>`;
}

// ---------- brief ----------
function renderBrief() {
  const sc = scenarioByN(cfg.scenario);
  const c = CONCEPT.scenarios.find(s => s.n === sc.n);
  const at = proj.native.scenario?.at ?? sc.at;
  const dn = proj.native.detections[0], dl = proj.legacy.detections[0];
  const focusName = sc.focus ? (SUPPLIERS.find(s => s.lon === sc.focus[0] && s.lat === sc.focus[1])?.name || SITES.find(s => s.lon === sc.focus[0] && s.lat === sc.focus[1])?.name) : null;
  $('#brief').innerHTML = `
    <h3><span class="n">S${sc.n}</span>${esc(sc.title)}</h3>
    <div class="meta">${at != null ? `<span class="badge risk">onset day ${Math.round(at)}</span>` : '<span class="badge ok">no disruption</span>'}${focusName ? `<span class="badge">${esc(focusName)}</span>` : ''}<span class="badge">seed ${cfg.seed}</span></div>
    <p>${esc(sc.model)}</p>
    ${c ? `<dl><div><dt>Signals the agents watch</dt><dd>${esc(c.signals)}</dd></div><div><dt>Agents do, inside mandate</dt><dd>${esc(c.auto)}</dd></div><div><dt>Humans decide</dt><dd>${esc(c.human)}</dd></div></dl>` : ''}
    ${sc.n ? `<div class="det"><span>Detection</span><span></span>
      <span class="n">Agent-native</span><b>${dn ? fmtLag(dn.lag) + (dn.lag < 0 ? ' (forecast)' : '') : '—'}</b>
      <span class="l">Legacy</span><b>${dl ? fmtLag(dl.lag) : '—'}</b>
      <span class="l" style="grid-column:1/-1">modelled: native ${fmtLag(sc.detect.native)}; legacy ${sc.detect.legacy[0]}–${sc.detect.legacy[2]} d</span></div>` : ''}`;
}

// Fade the bottom edge of rail panels that have more to scroll.
{
  const bodies = $$('.sim-rail .sim-card > .panel-body');
  const mark = (b) => b.classList.toggle('more', b.scrollTop + b.clientHeight < b.scrollHeight - 4);
  const ro = new ResizeObserver(() => bodies.forEach(mark));
  bodies.forEach(b => { ro.observe(b); [...b.children].forEach(c => ro.observe(c)); b.addEventListener('scroll', () => mark(b), { passive: true }); });
}

// ---------- ledger ----------
const FILTERS = [['all', 'All'], ['msg', 'Messages'], ['decision', 'Decisions'], ['risk', 'Risk'], ['ops', 'Milestones']];
let ledgerFilter = 'all', ledgerSig = '';
$('#ledgerFilters').innerHTML = FILTERS.map(([id, l]) => `<button class="chip ${id === 'all' ? 'on' : ''}" data-f="${id}" aria-pressed="${id === 'all'}">${l}</button>`).join('');
$('#ledgerFilters').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  ledgerFilter = b.dataset.f;
  $$('#ledgerFilters .chip').forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  ledgerSig = ''; renderLedger();
});
const keep = (e) => ledgerFilter === 'all' || (ledgerFilter === 'msg' && e.kind === 'msg') || (ledgerFilter === 'decision' && e.kind === 'decision')
  || (ledgerFilter === 'risk' && (e.sev === 'risk' || e.sev === 'warn' || e.kind === 'risk')) || (ledgerFilter === 'ops' && e.sev === 'ok');
function renderLedger() {
  const run = sims[cfg.watch];
  const sig = `${cfg.watch}|${run.ledger.length}|${ledgerFilter}|${choices.length}|${sims.native.seed}`;
  if (sig === ledgerSig) return;
  const prevLen = +(ledgerSig.split('|')[1] || 0), sameRun = ledgerSig.split('|')[0] === cfg.watch;
  ledgerSig = sig;
  const out = [];
  for (let i = run.ledger.length - 1; i >= 0 && out.length < 160; i--) {
    const e = run.ledger[i];
    if (!keep(e)) continue;
    const cls = [e.kind === 'msg' ? 'msg' : '', e.sev, sameRun && i >= prevLen ? 'new' : ''].join(' ');
    out.push(`<li class="${cls}"><time>${dayLabel(e.t)}</time><span><span class="who">${esc(e.desk)}</span><span class="txt">${esc(e.text)}</span></span></li>`);
  }
  $('#ledger').innerHTML = out.join('') || `<li class="ledger-empty">Nothing yet. Press play: the Planner explodes the three contracts into lines on day 0.</li>`;
}

// ---------- decisions ----------
let decSig = '';
function renderDecisions(force = false) {
  const run = sims[cfg.watch];
  const open = run.decisions.filter(d => d.status === 'open');
  const nOpenNative = sims.native.decisions.filter(d => d.status === 'open').length;
  const cnt = $('#decCount');
  cnt.textContent = String(nOpenNative);
  cnt.classList.toggle('hot', nOpenNative > 0 && !cfg.auto);
  const sig = `${cfg.watch}|${run.decisions.map(d => d.id + d.status).join(',')}|${Math.floor(T * 24)}|${cfg.auto}`;
  if (!force && sig === decSig) return;
  decSig = sig;
  const resolved = run.decisions.filter(d => d.status !== 'open').slice(-8).reverse();
  const card = (d) => {
    const age = T - d.t;
    const mine = cfg.watch === 'native' && d.status === 'open';
    return `<article class="dcard ${d.status}">
      <div class="top"><span class="badge ${d.sev === 'risk' ? 'risk' : 'warn'}">${d.id}</span><span>${esc(d.desk)}</span>${d.status === 'open' ? `<span class="age">open ${fmtLag(age)}</span>` : `<span style="margin-left:auto">${esc(d.by)} · ${fmtLag(d.resolvedAt - d.t)}</span>`}</div>
      <h5>${esc(d.title)}</h5><div class="why">${esc(d.why)}</div>
      ${d.block.length && d.status === 'open' ? `<div class="blocks">⏸ holding ${d.block.length} line${d.block.length > 1 ? 's' : ''} until decided</div>` : ''}
      ${mine ? `<div class="opts">${d.options.map(o => `<button class="btn sm ${o.id === d.rec ? 'primary' : ''}" data-dec="${d.id}" data-opt="${o.id}">${esc(o.label)}${o.id === d.rec ? ' · recommended' : ''}</button>`).join('')}</div>`
        : d.status === 'open' ? `<div class="why">${cfg.watch === 'legacy' ? 'Waiting on the approval chain (modelled).' : ''}</div>` : `<div class="why">→ ${esc(d.options.find(o => o.id === d.choice)?.label || d.choice)}</div>`}
    </article>`;
  };
  const empty = cfg.watch === 'native'
    ? `<div class="dec-empty"><b>No open exceptions.</b><br>Agents act inside their mandates; only exceptions reach a human. ${cfg.auto ? 'Auto-resolve is on: a modelled human picks the recommended option after a short delay. Turn it off to take the decisions yourself.' : 'Auto-resolve is off: when an agent escalates, the run pauses here and waits for you.'}</div>`
    : `<div class="dec-empty"><b>Legacy run.</b><br>Approvals are everywhere in this model, buried in email; only cross-functional escalations are shown here.</div>`;
  $('#decisions').innerHTML = (open.length ? open.map(card).join('') : empty) + (resolved.length ? `<div class="tiny muted" style="padding:6px 2px 0">Resolved</div>${resolved.map(card).join('')}` : '');
}
$('#decisions').addEventListener('click', e => {
  const b = e.target.closest('[data-dec]'); if (!b) return;
  const id = b.dataset.dec, opt = b.dataset.opt;
  if (sims.native.resolve(id, opt, 'you')) {
    choices.push({ mode: 'native', id, opt, t: T });
    toast(`${id} decided in ${fmtLag(T - sims.native.decisions.find(d => d.id === id).t)} (simulated time)`);
    dirty = 'all';
    if (!sims.native.decisions.some(d => d.status === 'open') && T < HORIZON) setPlaying(true);
  }
});

// ---------- desks ----------
const LEVEL = Object.fromEntries(CONCEPT.desks.map(d => [d.name, d.start]));
function renderDesks() {
  const run = sims[cfg.watch];
  const counts = run.deskCount, lastAt = run.deskLast;
  let names;
  if (cfg.watch === 'native') names = CONCEPT.desks.map(d => d.name);
  else names = Object.keys(counts).filter(n => n !== 'Human').sort((a, b) => counts[b] - counts[a]);
  const max = Math.max(1, ...names.map(n => counts[n] || 0));
  const youCount = run.decisions.filter(d => d.status === 'resolved').length;
  const tiles = names.map(n => {
    const c = counts[n] || 0, hot = lastAt[n] != null && T - lastAt[n] < 0.6;
    const lvl = LEVEL[n];
    return `<div class="sdesk ${hot ? 'hot' : c ? '' : 'idle'}"><span class="nm"><span class="dot"></span>${esc(n)}</span>
      <span class="ct"><span>${c.toLocaleString('en-US')} actions</span>${cfg.watch === 'native' && lvl ? `<span class="badge ${lvl.toLowerCase()}" data-tip="Concept start level ${lvl}; this run uses the '${cfg.autonomy === 'earned' ? 'earned (L3 inside mandate)' : 'approve every step'}' preset">${lvl}→${cfg.autonomy === 'earned' ? 'L3' : 'L1'}</span>` : ''}</span>
      <span class="bar"><i style="width:${(c / max) * 100}%"></i></span></div>`;
  }).join('');
  const head = cfg.watch === 'native'
    ? `<div class="sdesk you ${run.decisions.some(d => d.status === 'open') ? 'hot' : ''}"><span class="nm"><span class="dot"></span>You · the human team</span><span class="ct"><span>${youCount} exceptions decided · ${run.humanApprovals} step approvals</span></span></div>
       <p class="desks-note">36 desks from the concept. Desks without work in this scenario stay dim; they exist for functions the simulation does not model.</p>`
    : `<p class="desks-note">Legacy run: the same work done by people in functional teams. Every entry is a human touch.</p>`;
  $('#desks').innerHTML = head + tiles;
}

// ---------- tabs ----------
let tab = 'chart';
function selectTab(id) {
  tab = id;
  $$('.tabbar [role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  $$('.tabpane').forEach(p => { p.hidden = p.id !== `pane-${id}`; });
  dirty = 'all';
}
$('.tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab); });
$('.tabbar').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const ids = ['chart', 'ledger', 'decisions', 'desks'];
  const i = (ids.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length;
  selectTab(ids[i]); $(`#tab-${ids[i]}`).focus();
});

// ---------- controls ----------
function seg(el, value, on) {
  const set = (v) => $$('button', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  set(value);
  el.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; set(b.dataset.v); on(b.dataset.v); });
  return set;
}
$('#scenario').innerHTML = SCENARIOS.map(s => `<option value="${s.n}">${s.n ? `S${s.n} · ` : ''}${esc(s.title)}</option>`).join('');
$('#scenario').value = String(cfg.scenario);
$('#scenario').addEventListener('change', e => loadScenario(+e.target.value));
function loadScenario(n, { play = true } = {}) {
  cfg.scenario = n; $('#scenario').value = String(n);
  restart(); R?.home();
  if (play && !reduced) setPlaying(true);
}
const setWatch = seg($('#watchSeg'), cfg.watch, v => { cfg.watch = v; onWatch(); });
function onWatch() {
  $('#watchBadge').textContent = `Watching · ${RUN_NAME[cfg.watch]}`;
  $('#watchBadge').className = `badge ${cfg.watch === 'native' ? 'ok' : 'warn'}`;
  ledgerSig = ''; decSig = ''; dirty = 'all'; syncURL();
}
seg($('#policySeg'), cfg.policy, v => { cfg.policy = v; restart({ keepChoices: false, keepDay: true }); toast(v === 'jit' ? 'Just-in-time call-off' : 'Order everything as soon as possible'); });
seg($('#autonomySeg'), cfg.autonomy, v => { cfg.autonomy = v; restart({ keepDay: true }); toast(v === 'earned' ? 'Desks act inside mandate (L3)' : 'A human approves every screen, award and PO'); });
$('#autoResolve').checked = cfg.auto;
$('#autoResolve').addEventListener('change', e => { cfg.auto = e.target.checked; restart({ keepDay: true }); });
$('#seed').value = String(cfg.seed);
$('#seed').addEventListener('change', e => { cfg.seed = int(e.target.value, 1, 99999, 42); e.target.value = String(cfg.seed); restart(); });
$('#reseed').addEventListener('click', () => { cfg.seed = 1 + Math.floor(Math.random() * 99998); $('#seed').value = String(cfg.seed); restart(); if (!reduced) setPlaying(true); toast(`Seed ${cfg.seed}: a new physical world`); });
$('#link').addEventListener('click', async () => {
  const u = linkURL(true).toString();
  history.replaceState(null, '', u);
  try { await navigator.clipboard.writeText(u); toast('Link copied: it reproduces this exact run'); } catch { toast('Link is in the address bar'); }
});
const setView = seg($('#viewSeg'), cfg.view, v => { cfg.view = v; R?.setView(v, cfg.site); renderLegend(); syncURL(); });
function renderSiteSeg() {
  $('#siteSeg').innerHTML = SITES.map(s => `<button data-v="${s.id}" aria-pressed="${s.id === cfg.site}" title="${esc(s.name)} · ${esc(s.region)}">${s.id}</button>`).join('');
}
$('#siteSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  cfg.site = b.dataset.v; $$('#siteSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  if (cfg.view !== 'campus') { cfg.view = 'campus'; setView('campus'); }
  R?.setView('campus', cfg.site); renderLegend(); syncURL();
});
const LAYERS = [['lanes', 'Lanes', '--map-line'], ['ships', 'Shipments', '--s1'], ['msgs', 'Agent messages', '--accent'], ['sups', 'Suppliers', '--fg'], ['risk', 'Risk', '--risk']];
$('#layerChips').innerHTML = LAYERS.map(([id, l, c]) => `<button class="chip" data-layer="${id}" aria-pressed="true"><i style="background:var(${c})"></i>${l}</button>`).join('');
$('#layerChips').addEventListener('click', e => {
  const b = e.target.closest('[data-layer]'); if (!b) return;
  show[b.dataset.layer] = !show[b.dataset.layer]; b.setAttribute('aria-pressed', String(show[b.dataset.layer]));
});

// ---------- transport ----------
const playBtn = $('#play');
function setPlaying(v) {
  if (v && T >= HORIZON - 1e-6) { seek(0); }
  playing = v;
  playBtn.setAttribute('aria-pressed', String(v));
  playBtn.setAttribute('aria-label', v ? 'Pause' : 'Play');
}
playBtn.addEventListener('click', () => setPlaying(!playing));
$('#back').addEventListener('click', () => seek(Math.ceil(T) - 1));
$('#fwd').addEventListener('click', () => { advance(Math.min(HORIZON, Math.floor(T) + 1)); dirty = 'all'; });
$('#reset').addEventListener('click', () => { setPlaying(false); choices = []; build(); dirty = 'all'; R?.home(); });
scrub.addEventListener('input', () => { setPlaying(false); seek(+scrub.value); });
const speedEl = $('#speed');
speedEl.value = String(cfg.speed);
const showSpeed = () => { $('#speedOut').textContent = `${cfg.speed} d/s`; };
showSpeed();
speedEl.addEventListener('input', () => { cfg.speed = +speedEl.value; showSpeed(); });
speedEl.addEventListener('change', syncURL);
const orbitBtn = $('#orbitBtn');
orbitBtn.addEventListener('click', () => { if (!R) return; R.orbit = !R.orbit; orbitBtn.setAttribute('aria-pressed', String(R.orbit)); });
$('#homeBtn').addEventListener('click', () => R?.home());

document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') && e.target.type !== 'range') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (k === 'ArrowRight' && !e.target.closest('[role="tablist"]')) { e.preventDefault(); advance(Math.min(HORIZON, Math.floor(T) + (e.shiftKey ? 10 : 1))); dirty = 'all'; }
  else if (k === 'ArrowLeft' && !e.target.closest('[role="tablist"]')) { e.preventDefault(); seek(Math.ceil(T) - (e.shiftKey ? 10 : 1)); }
  else if (k === 'r' || k === 'R') $('#reset').click();
  else if (k === 'l' || k === 'L') { cfg.watch = cfg.watch === 'native' ? 'legacy' : 'native'; setWatch(cfg.watch); onWatch(); }
  else if (k === 'g' || k === 'G') { cfg.view = 'globe'; setView('globe'); R?.setView('globe'); renderLegend(); }
  else if (k === 'c' || k === 'C') { cfg.view = 'campus'; setView('campus'); R?.setView('campus', cfg.site); renderLegend(); }
  else if (['1', '2', '3'].includes(k)) $$('#siteSeg button')[+k - 1]?.click();
  else if (k === 'o' || k === 'O') orbitBtn.click();
  else if (k === 'h' || k === 'H') R?.home();
  else if (k === '+' || k === '=' || k === ']') { cfg.speed = Math.min(12, cfg.speed * 1.5); speedEl.value = cfg.speed; cfg.speed = +speedEl.value; showSpeed(); }
  else if (k === '-' || k === '[') { cfg.speed = Math.max(0.25, cfg.speed / 1.5); speedEl.value = cfg.speed; cfg.speed = +speedEl.value; showSpeed(); }
});

// ---------- legend ----------
const sw = (v, cls = '') => `<i class="${cls}" style="background:var(${v})"></i>`;
const GLOBE_KEY = [
  [sw('--s1'), 'GPU rack lots'], [sw('--s3'), 'Optics'], [sw('--s6'), 'Switches'], [sw('--s2'), 'CDUs'], [sw('--s5'), 'Switchgear'], [sw('--s4'), 'Transformers'],
  [sw('--accent', 'ln'), 'Message out'], [sw('--glow', 'ln'), 'Message in'], [sw('--warn'), 'Flag / held'], [sw('--risk'), 'Risk'],
];
const CAMPUS_KEY = RACK_STATES.map(([id, label]) => [`<i class="sq" style="background:${{ planned: 'color-mix(in oklab, var(--fg) 18%, transparent)', ordering: 'color-mix(in oklab, var(--info) 40%, transparent)', making: 'color-mix(in oklab, var(--info) 65%, transparent)', transit: 'var(--glow)', dock: 'var(--warn)', install: 'var(--glow-2)', burnin: 'var(--s5)', live: 'var(--accent)', rma: 'var(--risk)', paused: 'color-mix(in oklab, var(--risk) 55%, transparent)' }[id]}"></i>`, label]);
function renderLegend() {
  const items = cfg.view === 'globe' ? GLOBE_KEY : CAMPUS_KEY;
  $('#mapLegend').innerHTML = items.map(([i, l]) => `<span>${i}${l}</span>`).join('');
}
$('#globeKey').innerHTML = [
  [sw('--fg'), '<b>Suppliers</b> (fictional, on real geography). Ring colour shows a flag; size grows with active orders.'],
  [sw('--s2'), '<b>Tier-3 suppliers</b>: foundry, packaging and memory, seen through ownership and trade graphs.'],
  [sw('--accent', 'sq'), '<b>Site columns</b> rise with billable GPUs; the wireframe is the contracted capacity.'],
  [sw('--s1'), '<b>Moving dots</b> are shipments with trails, coloured by material: racks, optics, switches, CDUs, switchgear, transformers.'],
  [sw('--accent', 'ln'), '<b>Arcs</b> are messages between agents and suppliers: out from the control plane, in from suppliers (A2A, hosted agent, or Envoy over email).'],
  [sw('--risk'), '<b>Pulsing rings</b> are active disruptions. Click a site to open its campus.'],
].map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join('');
$('#campusKey').innerHTML = RACK_STATES.map(([id, label], k) => `<li>${CAMPUS_KEY[k][0]}<span><b>${label}</b>${{ planned: ': not yet called off (just-in-time waits on purpose)', dock: ': idle capital, depreciating', live: ': earning at the contract rate', rma: ': swapped from spares (native) or RMA to the ODM (legacy)' }[id] || ''}</span></li>`).join('')
  + `<li>${sw('--glow', 'sq')}<span><b>Hall shells</b> rise as construction progresses; feeders turn green when the site is energised.</span></li>`;

// ---------- below the fold: assumptions, claims, sweep ----------
$('#assumpTable').innerHTML = `<thead><tr><th>Step</th><th>Agent-native</th><th>Legacy (modelled)</th><th>Basis</th></tr></thead><tbody>${ASSUMPTIONS.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td><span class="badge ${r[3] === 'modelled' ? 'l2' : r[3] === 'policy' ? 'l3' : 'l1'}">${esc(r[3])}</span></td></tr>`).join('')}</tbody>`;

let sweepJob = 0, claimTimer = null;
function scheduleClaims() { clearTimeout(claimTimer); claimTimer = setTimeout(runSweep, 400); }
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 200 }) : setTimeout(fn, 16));
function headless(n, mode, over = {}) {
  const s = new Sim({ seed: cfg.seed, mode, scenario: freshScenario(n), autoResolve: true, policy: cfg.policy, autonomy: cfg.autonomy, ...over });
  s.runToEnd();
  return s;
}
function runSweep() {
  const job = ++sweepJob;
  $('#claimSeed').textContent = String(cfg.seed);
  const rows = SCENARIOS.map(s => ({ s, n: null, l: null }));
  const table = $('#sweepTable');
  const fmtD = (v) => (v == null ? 'not by d240' : `day ${Math.round(v)}`);
  const draw = () => {
    table.innerHTML = `<thead><tr><th>#</th><th>Scenario</th><th>All billable · native</th><th>· legacy</th><th>Late rack-days N / L</th><th>Revenue by d${REPORT_DAY} N / L</th><th>Detection N / L</th><th>Exposure N / L</th></tr></thead><tbody>${rows.map(r => {
      if (!r.n || !r.l) return `<tr class="pending"><td>S${r.s.n}</td><td>${esc(r.s.title)}</td><td colspan="6">running…</td></tr>`;
      const a = r.n.k, b = r.l.k;
      const better = (x, y) => (x == null ? 'bad' : y == null || x < y ? 'good' : x > y ? 'bad' : '');
      return `<tr data-n="${r.s.n}" class="${r.s.n === cfg.scenario ? 'current' : ''}" tabindex="0"><td>S${r.s.n}</td><td>${esc(r.s.title)}</td>
        <td class="n ${better(a.allLive, b.allLive)}">${fmtD(a.allLive)}</td><td class="l">${fmtD(b.allLive)}</td>
        <td><span class="n">${Math.round(a.lateRackDays).toLocaleString('en-US')}</span> / <span class="l">${Math.round(b.lateRackDays).toLocaleString('en-US')}</span></td>
        <td><span class="n">$${a.revenueM.toFixed(1)}M</span> / <span class="l">$${b.revenueM.toFixed(1)}M</span></td>
        <td>${r.s.n ? `<span class="n">${a.detection != null ? fmtLag(a.detection) : '—'}</span> / <span class="l">${b.detection != null ? fmtLag(b.detection) : '—'}</span>` : '—'}</td>
        <td><span class="n ${a.exposure ? 'bad' : ''}">${a.exposure}</span> / <span class="l ${b.exposure ? 'bad' : ''}">${b.exposure}</span></td></tr>`;
    }).join('')}</tbody>`;
  };
  draw();
  const queue = [];
  for (const r of rows) for (const mode of ['native', 'legacy']) queue.push([r, mode]);
  const stepJob = () => {
    if (job !== sweepJob) return;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 24) {
      const [r, mode] = queue.shift();
      const s = headless(r.s.n, mode);
      r[mode === 'native' ? 'n' : 'l'] = { k: s.kpis(REPORT_DAY), s };
    }
    draw();
    if (queue.length) idle(stepJob); else claims(rows, job);
  };
  idle(stepJob);
}
$('#sweepTable').addEventListener('click', e => { const tr = e.target.closest('tr[data-n]'); if (tr) { loadScenario(+tr.dataset.n); $('#stage').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); } });
$('#sweepTable').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('tr[data-n]')?.click(); });
function claims(rows, job) {
  if (job !== sweepJob) return;
  const inf = (v) => (v == null ? Infinity : v);
  const out = [];
  const lateN = rows.filter(r => inf(r.n.k.allLive) > inf(r.l.k.allLive));
  out.push({ ok: !lateN.length, title: 'Agent-native reaches full capacity no later than legacy, in every scenario', detail: lateN.length ? `fails in ${lateN.map(r => 'S' + r.s.n).join(', ')}` : `${rows.length}/${rows.length} scenarios; median gain ${median(rows.map(r => inf(r.l.k.allLive) - inf(r.n.k.allLive)).filter(Number.isFinite)).toFixed(0)} days` });
  const s8 = rows.find(r => r.s.n === 8);
  const exN = rows.reduce((a, r) => a + r.n.k.exposure, 0);
  out.push({ ok: exN === 0 && s8.l.k.exposure > 0, title: 'Agents never commit to or pay a party after a designation in its ownership chain; the legacy model does (S8)', detail: `native exposure ${exN} across all scenarios · legacy ${s8.l.k.exposure} events in S8` });
  const slow = rows.filter(r => r.s.n && !(inf(r.n.k.detection) < inf(r.l.k.detection)));
  out.push({ ok: !slow.length, title: 'Agents detect every disruption before the legacy organisation notices it', detail: slow.length ? `not faster in ${slow.map(r => 'S' + r.s.n).join(', ')}` : `median native lag ${fmtLag(median(rows.filter(r => r.s.n).map(r => r.n.k.detection)))} vs legacy ${fmtLag(median(rows.filter(r => r.s.n).map(r => r.l.k.detection)))}` });
  const base = rows[0];
  idle(() => {
    if (job !== sweepJob) return;
    const other = cfg.policy === 'jit' ? 'asap' : 'jit';
    const alt = headless(0, 'native', { policy: other }).kpis(REPORT_DAY);
    const jit = cfg.policy === 'jit' ? base.n.k : alt, asap = cfg.policy === 'jit' ? alt : base.n.k;
    out.push({ ok: jit.idleCostM < asap.idleCostM && inf(jit.allLive) <= inf(asap.allLive) + 1, title: 'Just-in-time call-off holds less idle capital than ordering everything at once, without delaying full capacity (baseline)', detail: `idle depreciation $${jit.idleCostM.toFixed(1)}M vs $${asap.idleCostM.toFixed(1)}M · all billable day ${Math.round(inf(jit.allLive))} vs ${Math.round(inf(asap.allLive))}` });
    const d1 = headless(0, 'native', { autonomy: 'dayone' });
    const k1 = d1.kpis(REPORT_DAY), ke = cfg.autonomy === 'earned' ? base.n.k : headless(0, 'native', { autonomy: 'earned' }).kpis(REPORT_DAY);
    const touchX = k1.humanTouches / Math.max(1, ke.humanTouches);
    out.push({ ok: k1.approvals > 0 && touchX >= 10 && Math.abs(inf(k1.firstLive) - inf(ke.firstLive)) <= 2, title: 'Approving every step multiplies human work without buying schedule: autonomy is earned to free people, and slack hides the cost until float runs out (baseline)', detail: `${k1.approvals} approvals · human touches ${k1.humanTouches} vs ${ke.humanTouches} (${Math.round(touchX)}×) · first billable day ${Math.round(inf(k1.firstLive))} vs ${Math.round(inf(ke.firstLive))}` });
    const a = headless(cfg.scenario, 'native'), b = headless(cfg.scenario, 'native');
    const h = (s) => s.ledger.map(e => `${e.t.toFixed(6)}${e.text}`).join('\n');
    out.push({ ok: h(a) === h(b) && a.ledger.length > 0, title: 'Same seed, same run: the simulation is deterministic, so a link reproduces it exactly', detail: `${a.ledger.length.toLocaleString('en-US')} ledger entries matched for S${cfg.scenario}, seed ${cfg.seed}` });
    $('#claimList').innerHTML = out.map(c => `<li><div class="c-text"><b>${esc(c.title)}</b><span>${esc(c.detail)}</span></div><span class="verdict ${c.ok ? 'hold' : 'fail'}">${c.ok ? '✓ holds' : '✗ fails'}</span></li>`).join('');
  });
}
function median(a) { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// ---------- boot ----------
let R = null, dirty = 'all';
build(); project();
renderSiteSeg(); renderBrief(); renderMarks(); onWatch(); renderLegend();
if (startDay > 0) advance(startDay, { quiet: true });

async function boot3D() {
  if (!webglOK()) { $('#fallback').hidden = false; $('#map').hidden = true; return; }
  let land = null;
  try { land = await (await fetch('assets/data/land-110m.geojson')).json(); } catch { /* globe without land */ }
  try {
    R = createRenderer($('#map'), {
      land,
      onInteract: () => orbitBtn.setAttribute('aria-pressed', 'false'),
      onPick: (info) => {
        const o = info.object; if (!o) return;
        const site = info.layer?.id === 'sites' ? o : info.layer?.id === 'site-cols' ? o.site : null;
        if (site) { cfg.site = site.id; renderSiteSeg(); cfg.view = 'campus'; setView('campus'); R.setView('campus', site.id); renderLegend(); syncURL(); }
      },
    });
    R.setView(cfg.view, cfg.site);
    window.addEventListener('themechange', () => R.retheme());
    if (document.fonts?.ready) document.fonts.ready.then(() => R.retheme());
  } catch (err) {
    console.warn('3D view disabled:', err);
    $('#fallback').hidden = false; $('#map').hidden = true; R = null;
  }
}
boot3D();
scheduleClaims();

let last = performance.now(), uiAcc = 1;
// Adaptive resolution: on HiDPI screens that cannot hold ~24 fps, render at 1 device pixel per CSS pixel.
// Never go below 1×: SDF labels and thin lanes fall apart at sub-CSS resolution.
const perf = { n: 0, sum: 0, done: !(window.devicePixelRatio > 1) };
function adapt(rawDt) {
  if (!R || perf.done || document.hidden || rawDt > 1) return;
  perf.n++; perf.sum += rawDt;
  if (perf.n < 45) return;
  perf.done = true;
  if (perf.n / perf.sum < 24) R.setPixelRatio(1);
}
function frame(now) {
  const raw = (now - last) / 1000; adapt(raw);
  const dt = Math.min(0.25, raw); last = now;
  if (playing) { advance(Math.min(HORIZON, T + dt * cfg.speed)); }
  if (R) R.update({ sim: sims[cfg.watch], t: T, show, wall: now / 1000 }, reduced ? 0 : dt);
  uiAcc += dt;
  if (dirty || uiAcc > 0.15) {
    uiAcc = 0;
    renderClock(); renderScore();
    if (tab === 'chart') renderChart();
    if (tab === 'ledger') renderLedger();
    renderDecisions(dirty === 'all');
    if (tab === 'desks') renderDesks();
    if (dirty === 'all') renderBrief();
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (startDay === 0 && !reduced) setTimeout(() => { if (!playing && T === 0) setPlaying(true); }, 900);

// Exposed for tests and the curious: window.nso.sims.native.ledger
window.nso = { get sims() { return sims; }, get T() { return T; }, get renderer() { return R; }, cfg, seek, setPlaying };
