import { mountShell, observeReveals, toast } from '../shell.js';
import { CONCEPT as C } from '../data/concept.js';
import { md, esc, strip } from '../lib/md.js';
import { heroGraph } from '../lib/heroGraph.js';

mountShell('index');
const $ = (s, r = document) => r.querySelector(s);
const allFns = C.lanes.flatMap(l => l.functions.map(f => ({ ...f, lane: l.code, laneName: l.name })));
const lvl = (a) => { const m = /L(\d)/.exec(a || ''); return m ? +m[1] : 0; };

// ---------- Hero ----------
let ev = 0, hu = 0;
heroGraph($('#heroGraph'), {
  desks: C.desks.length, lanes: C.lanes.length,
  onEvent: (k) => { ev++; if (k === 'human') hu++; if (ev % 3 === 0) { $('#liveEvents').textContent = ev.toLocaleString(); $('#liveHuman').textContent = hu; } },
});
$('#statstrip').innerHTML = [
  [allFns.length, '', 'supply chain functions, SCOR DS aligned'],
  [C.desks.length, '', 'agent desks with mandates'],
  ['1', '<small>vs 140</small>', 'platform instead of an app portfolio'],
  ['2', '', 'human decisions on the happy path'],
  ['<1', '<small>hr</small>', 'signal to protective action (target)'],
].map(([b, s, l]) => `<div class="stat"><b>${b}${s}</b><span>${l}</span></div>`).join('');

// ---------- Problem ----------
$('#pains').innerHTML = C.pains.map((p, i) => `
  <article class="card card-glow pain reveal ${['', 'd1', 'd2'][i % 3]}">
    <span class="n">0${i + 1}</span><h3>${esc(p.pain)}</h3><p>${md(p.looks)}</p>
    <div class="cost"><b>What it costs</b>${md(p.costs)}</div>
  </article>`).join('');

// ---------- Topology ----------
const NODES = {
  X: { x: 20, y: 30, w: 180, h: 46, t: 'Suppliers & parties', s: 'ODMs · carriers · utilities', d: 'Every external counterparty: native agents (tier A), hosted agents (tier B) or email, EDI and portals (tier C).' },
  H: { x: 270, y: 20, w: 220, h: 52, t: 'Humans', s: 'CSCO · exception desk', d: 'Set intent, approve what policy escalates, hold strategic relationships and sign what the law reserves for a person. They work from one cockpit with a decision queue and a daily brief.', cls: 'human' },
  C: { x: 290, y: 110, w: 180, h: 46, t: 'Conductor', s: 'routes & decomposes', d: 'Turns intent and events into tasks for domain desks. It reasons over typed returns only, never raw content, and makes no direct commitments.' },
  E: { x: 20, y: 200, w: 180, h: 46, t: 'Envoy gateway', s: 'A2A · email · EDI', d: 'The only path in or out for counterparties. It enforces identity, signatures, information barriers and rate limits.' },
  D: { x: 270, y: 200, w: 220, h: 56, t: 'Domain desks ×36', s: 'plan · source · build · risk', d: 'Agents with charters, typed MCP tools, mandates, KPIs and evaluation suites. Stateless between tasks; memory comes from the graph and the Librarian.' },
  A: { x: 550, y: 200, w: 180, h: 46, t: 'Auditor', s: 'other model family', d: 'Independent second opinion. It samples events, and checks every high-value or high-risk class. It can raise findings and trigger kill switches.' },
  R: { x: 20, y: 310, w: 180, h: 46, t: 'Reader', s: 'quarantined · no tools', d: 'Turns untrusted documents, emails and agent messages into schema-validated data. Its output is data, never instructions, which is the defence against prompt injection.' },
  P: { x: 270, y: 300, w: 220, h: 50, t: 'Policy & Mandate Engine', s: 'deterministic code', d: 'On the write path, and no agent can bypass it. It checks delegation of authority, mandate scope, cap and expiry, holds, separation of duties and budget, then returns allow, deny or escalate.', cls: 'gate' },
  L: { x: 270, y: 400, w: 220, h: 50, t: 'Ledger + Supply Graph', s: 'append-only · signed', d: 'Every state change is a signed event: who, under which mandate, with what evidence. The graph is a projection of the ledger, so any state can be replayed.' },
  T: { x: 550, y: 400, w: 180, h: 50, t: 'Sayari + rails', s: 'MCP tool fabric', d: 'Rented senses and rails: Sayari, official lists, trade data, hazards, carriers, banks and the customs broker. In tests they are DTSF twins, so no metered queries are spent.' },
};
// [path, label, labelX, labelY, style]
const EDGES = [
  ['M380,72 L380,110', 'intent', 388, 95],
  ['M380,156 L380,200', 'tasks', 388, 182],
  ['M380,256 L380,300', 'proposed', 388, 282],
  ['M380,350 L380,400', 'allowed only', 388, 379],
  ['M110,76 L110,200', 'A2A · email · EDI', 118, 142],
  ['M110,246 L110,310', 'untrusted', 118, 282],
  ['M200,333 C240,333 232,242 270,242', 'schema-valid', 214, 365],
  ['M270,216 L200,216', 'typed msgs', 206, 209],
  ['M550,223 L490,223', 're-checks', 494, 216, 'dash'],
  ['M490,325 H510 Q518,325 518,317 V53 Q518,45 510,45 H490', 'out of mandate|→ named human', 526, 140, 'escalate'],
  ['M490,250 C545,262 640,330 640,400', 'tools', 604, 334, 'dash'],
];
const svg = $('#topo');
svg.innerHTML = EDGES.map(([d, label, lx, ly, kind], i) => {
  const lines = label.split('|').map((t, j) => `<tspan x="${lx}" dy="${j ? 12 : 0}">${t}</tspan>`).join('');
  return `<path id="e${i}" class="edge ${kind === 'dash' ? 'dash' : ''}" d="${d}" ${kind === 'escalate' ? 'style="stroke:var(--glow);stroke-dasharray:5 4"' : ''}/><text class="elabel" x="${lx}" y="${ly}">${lines}</text>`;
}).join('') + Object.entries(NODES).map(([k, n]) => `
  <g class="node ${n.cls || ''}" data-n="${k}" tabindex="0" role="button" aria-label="${n.t}">
    <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"/>
    <text x="${n.x + 12}" y="${n.y + 20}">${n.t}</text><text class="sub" x="${n.x + 12}" y="${n.y + 36}">${n.s}</text>
  </g>`).join('') + '<g id="packets"></g>';
function showNode(k) {
  const n = NODES[k];
  svg.querySelectorAll('.node').forEach(g => g.classList.toggle('on', g.dataset.n === k));
  $('#nodeInfo').innerHTML = `<span class="k">${n.s}</span><h4>${n.t}</h4><p class="small muted" style="margin:0">${n.d}</p>`;
}
svg.addEventListener('click', e => { const g = e.target.closest('.node'); if (g) showNode(g.dataset.n); });
svg.addEventListener('keydown', e => { const g = e.target.closest('.node'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showNode(g.dataset.n); } });
showNode('C');

const packetsG = svg.querySelector('#packets');
function sendPacket(edgeIdx, cls = '', dur = 900) {
  return new Promise(res => {
    const path = svg.querySelector('#e' + edgeIdx), L = path.getTotalLength();
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', 4.5); c.setAttribute('class', 'packet ' + cls); packetsG.appendChild(c);
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), p = path.getPointAtLength(L * (1 - Math.pow(1 - k, 2)));
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      if (k < 1) requestAnimationFrame(step); else { c.remove(); res(); }
    };
    requestAnimationFrame(step);
  });
}
const wp = [...document.querySelectorAll('#writepath li')];
const mark = (i) => wp.forEach((li, j) => li.classList.toggle('on', j === i));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let playing = false;
async function playWritePath() {
  if (playing) return; playing = true;
  $('#topoPlay').disabled = true;
  await sendPacket(4); await sendPacket(5, 'risk'); await sendPacket(6);
  mark(0); showNode('D'); await sendPacket(2);
  mark(1); showNode('P'); await sleep(700);
  mark(2); await sendPacket(3); showNode('L'); await sleep(500);
  mark(0); await sendPacket(2);
  mark(3); showNode('H'); await sendPacket(9, '', 1400); await sleep(400);
  mark(4); showNode('A'); await sendPacket(8, '', 800);
  await sleep(900); mark(-1);
  $('#topoPlay').disabled = false; playing = false;
}
$('#topoPlay').addEventListener('click', playWritePath);
new IntersectionObserver(([en], o) => { if (en.isIntersecting) { o.disconnect(); setTimeout(playWritePath, 500); } }, { threshold: 0.5 }).observe(svg);

// ---------- Function explorer ----------
const state = { lane: 'all', auto: 'all', q: '', desk: null };
$('#fnCount').textContent = allFns.length;
function renderLanes() {
  const btn = (code, name, ct) => `<button class="lane-btn" data-lane="${code}" aria-pressed="${state.lane === code}"><span class="code">${code === 'all' ? '∗' : code}</span><span class="nm">${esc(name)}</span><span class="ct">${ct}</span></button>`;
  $('#lanes').innerHTML = btn('all', 'All lanes', allFns.length) + C.lanes.map(l => btn(l.code, l.name, l.functions.length)).join('');
}
function renderFns() {
  const q = state.q.toLowerCase();
  const deskFns = state.desk ? new Set(C.desks.find(d => d.name === state.desk)?.functions || []) : null;
  const list = allFns.filter(f =>
    (state.lane === 'all' || f.lane === state.lane) &&
    (state.auto === 'all' || (state.auto === 'L3' ? lvl(f.autonomy) >= 3 : f.autonomy?.startsWith(state.auto))) &&
    (!deskFns || deskFns.has(f.n)) &&
    (!q || [f.fn, f.desk, f.human, f.replaces, f.laneName].join(' ').toLowerCase().includes(q)));
  $('#fnShown').textContent = `${list.length} of ${allFns.length} shown${state.desk ? ` · desk: ${state.desk}` : ''}`;
  $('#fnList').innerHTML = list.map(f => `
    <div class="fn ${deskFns ? 'hl' : ''}">
      <span class="no">#${f.n}<br>${f.lane}</span>
      <div><div class="t">${md(f.fn)}</div>
        <div class="meta"><span>desk <b>${md(f.desk)}</b></span><span>human <b>${md(f.human)}</b></span>${f.replaces ? `<span class="rep">replaces ${md(f.replaces)}</span>` : ''}</div></div>
      <div style="text-align:right"><span class="badge l${lvl(f.autonomy)}" data-tip="Starting autonomy: ${esc(C.ladder[lvl(f.autonomy)]?.name || '')}">${esc(f.autonomy)}</span>
        <div class="autobar">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= lvl(f.autonomy) ? 'on' : ''}"></i>`).join('')}</div></div>
    </div>`).join('') || '<p class="muted small">Nothing matches.</p>';
}
$('#lanes').addEventListener('click', e => { const b = e.target.closest('[data-lane]'); if (!b) return; state.lane = b.dataset.lane; state.desk = null; renderLanes(); renderDesks(); renderFns(); });
$('#autoFilter').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; state.auto = b.dataset.a; $('#autoFilter').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderFns(); });
$('#fnSearch').addEventListener('input', e => { state.q = e.target.value; renderFns(); });

function renderDesks() {
  $('#desks').innerHTML = C.desks.map(d => `
    <button class="desk ${['Reader', 'Auditor', 'Envoy', 'Conductor'].includes(d.name) ? 'special' : ''}" aria-pressed="${state.desk === d.name}" data-desk="${esc(d.name)}" data-tip="<b>${esc(d.name)}</b><br>Tools: ${esc(strip(d.tools))}<br>Mandate: ${esc(strip(d.mandate))}">
      <span class="dn">${esc(d.name)} <span class="badge l${lvl(d.start)}">${esc(d.start)}</span></span>
      <span class="dm">${md(d.mandate)}</span>
      <span class="df">fn ${d.functions.join(', ')}</span>
    </button>`).join('');
}
$('#desks').addEventListener('click', e => {
  const b = e.target.closest('[data-desk]'); if (!b) return;
  state.desk = state.desk === b.dataset.desk ? null : b.dataset.desk;
  state.lane = 'all'; renderLanes(); renderDesks(); renderFns();
  if (state.desk) $('#fnList').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
renderLanes(); renderFns(); renderDesks();

// ---------- Suppliers ----------
$('#tiers').innerHTML = C.tiers.rows.map((r, i) => `
  <article class="card card-glow tier reveal ${['', 'd1', 'd2'][i]}"><span class="big">${esc(r[0].split(':')[0])}</span><h3>${md(r[0].split(':')[1] || '')}</h3>
  <p class="small"><b>${md(r[1])}.</b> <span class="muted">${md(r[2])}</span></p><div class="fit">Likely fit: ${md(r[3])}</div></article>`).join('');
$('#msgs').innerHTML = C.messages.rows.map(r => `<dt>${esc(r[0])}</dt><dd>${r[1].split(/,\s*/).map(m => `<span class="chip">${esc(strip(m))}</span>`).join('')}</dd>`).join('');
$('#wire').innerHTML = `<span class="c">// Envoy → Negotiator · after Reader validation · schema nso.quote/1</span>
{
  <span class="k">"type"</span>: <span class="s">"Quote"</span>,
  <span class="k">"from"</span>: { <span class="k">"party"</span>: <span class="s">"odm:example-b"</span>, <span class="k">"agent"</span>: <span class="s">"tier-A"</span>, <span class="k">"authority"</span>: <span class="s">"mandate:odm-b/sales/2026-q4"</span> },
  <span class="k">"inReplyTo"</span>: <span class="s">"rfq:rack-int/w2/0042"</span>,
  <span class="k">"lines"</span>: [{ <span class="k">"sku"</span>: <span class="s">"RACK-NVL-class"</span>, <span class="k">"qty"</span>: 64, <span class="k">"unit"</span>: <span class="s">"USD 3.21M"</span>, <span class="k">"ship"</span>: <span class="s">"W+11"</span> }],
  <span class="k">"terms"</span>: { <span class="k">"warranty"</span>: <span class="s">"36m"</span>, <span class="k">"prepay"</span>: <span class="s">"20%"</span>, <span class="k">"ld"</span>: <span class="s">"template:LD-3"</span> },
  <span class="k">"disclosure"</span>: <span class="s">"AI agent acting under mandate"</span>,
  <span class="k">"sig"</span>: <span class="s">"ed25519:9f2c…e1"</span>, <span class="k">"nonce"</span>: <span class="s">"01J…Q7"</span>
}`;

// ---------- Risk ----------
const table = (sel, head, rows, fmt = md) => { $(sel).innerHTML = `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</tbody>`; };
table('#signals', C.signals.head, C.signals.rows);
table('#tools', [C.sayariTools.head[0], C.sayariTools.head[1], C.sayariTools.head[2]], C.sayariTools.rows.map(r => r.slice(0, 3)));

// ---------- Humans ----------
$('#ladder').innerHTML = C.ladder.map((l, i) => `
  <div style="--i:${i};min-height:${150 + i * 34}px" class="reveal ${['', 'd1', 'd2', 'd3', 'd3'][i]}"><span class="lv">${esc(l.level)}</span><b>${esc(l.name)}</b><p>${md(l.may)}</p>${l.promote !== '—' ? `<span class="pr">promote to ${esc(l.level)} when: ${md(l.promote)}</span>` : ''}</div>`).join('');
table('#team', ['Role', 'Count', 'Owns'], C.team.map(t => [t.role, t.count, t.owns]));
table('#exceptions', C.exceptions.head, C.exceptions.rows);
{
  let lo = 0, hi = 0;
  for (const t of C.team) { const m = /(\d+)(?:\s*[–-]\s*(\d+))?/.exec(t.count) || [0, 1]; const a = +m[1], b = +(m[2] || m[1]); const k = /site/.test(t.count) ? 2 : 1; lo += a * k; hi += b * k; }
  $('#teamCount').textContent = `${lo}–${hi}`;
  $('#teamCount').setAttribute('data-tip', 'Sum of the operating-model table, assuming two active build sites');
}

// ---------- Day in the life ----------
const DIL = {
  happy: [
    ['07:10', 'CRM → Graph', 'A three-year reservation for next-generation GPU capacity is signed. ReservationSigned lands on the ledger.', 0, 'Signal'],
    ['07:12', 'Planner', 'Converts it into racks, fabric, megawatts, floor space and dates. Wave 1 fits Hall 3 at Site A. Wave 2 needs Hall 4, whose switchgear is nine weeks late.', 0, 'Plan'],
    ['07:20', 'Allocator → human', 'Drafts the allocation request to the accelerator vendor. A human relationship owner reviews and sends it, because the relationship is strategic.', 0, 'Draft'],
    ['07:25', 'Negotiator · Envoy · Reader', 'RFQs go to three qualified ODMs. Two reply in minutes through their own agents; the third replies by email, which the Reader turns into a structured quote. Two rounds run within the mandate.', 0, 'Source'],
    ['07:48', 'Screener · Sayari', 'Re-screens all three ODMs and their tier-2 sources. A cable assembler shows a new export_controls_adjacent flag, which is routed to trade compliance as a prompt. That quote is held; the others proceed.', 0, 'Screen'],
    ['08:05', 'LLE Expeditor', 'Finds two alternate switchgear units, prices the expedite cost against revenue at risk, and puts one decision in the CSCO\'s cockpit.', 1, 'Escalate'],
    ['08:30', 'CSCO · Trade compliance', 'The CSCO approves the switchgear from its evidence pack. Compliance clears the flag as a name-alike, with the evidence recorded.', 1, 'Decide'],
    ['08:31', 'Buyer · Dispatcher · Customs · Registrar', 'Supplier agents acknowledge the POs and ship notices stream in. Freight is booked, entries are pre-classified, serial records are pre-created and burn-in is scheduled.', 0, 'Execute'],
    ['W+11', 'Deployer · Commissioner · Treasury Aide', 'Racks arrive. Dock-to-rack is tracked per serial, burn-in results are ingested, acceptance triggers billing, and the lender collateral report updates itself.', 0, 'Billable'],
  ],
  risk: [
    ['02:14', 'Watchtower · Screener', 'The overnight sweep finds that the sub-tier maker of a liquid-cooling quick-disconnect was acquired by an entity on a restricted list. The exposure comes through ownership.', 0, 'Signal'],
    ['02:16', 'Mapper', 'Traces the exposure: part families, the ODMs that use them, open orders, racks in transit and in halls, and the customers whose capacity depends on them.', 0, 'Trace'],
    ['02:19', 'Screener', 'Splits it into a compliance question (hold new purchases?) and a supply question (what are the alternates?). A reversible hold is placed automatically under the compliance mandate.', 0, 'Hold'],
    ['02:30', 'Resilience', 'Simulates the options: which halls slip and by how much, revenue at risk, and the qualification status of alternates on the approved vendor list.', 0, 'Simulate'],
    ['02:41', 'Exception desk', 'Receives one brief: hold applied automatically; fast-track qualification of alternate Z needs approval; legal decides on installed units.', 2, 'Escalate'],
    ['02:45', 'Envoy → ODM agents', 'The affected ODMs\' agents receive a structured change request and reply with alternate source plans.', 0, 'Engage'],
  ],
};
let dilPath = 'happy', dilIdx = 0, dilTimer = null;
function renderDil() {
  const steps = DIL[dilPath];
  $('#dilSteps').innerHTML = steps.map((s, i) => `<button aria-current="${i === dilIdx ? 'step' : 'false'}" data-i="${i}"><span class="who">${s[0]} · ${esc(s[1])} ${s[3] ? '<span class="human-tag">· human</span>' : ''}</span><span class="what">${esc(s[2].split('. ')[0])}.</span></button>`).join('');
  const s = steps[dilIdx];
  const humans = steps.slice(0, dilIdx + 1).reduce((a, x) => a + (x[3] ? 1 : 0), 0);
  const humanTotal = dilPath === 'happy' ? 2 : 1;
  $('#dilDetail').innerHTML = `<span class="eyebrow">${s[4]} · ${s[0]}</span><div class="big">${esc(s[1])}</div><p>${esc(s[2])}</p>
    <div class="counter-row"><div class="stat"><b>${dilIdx + 1}/${steps.length}</b><span>steps</span></div><div class="stat"><b>${Math.min(humans, humanTotal)}</b><span>human decisions</span></div><div class="stat"><b>${dilPath === 'happy' ? '80m' : '<30m'}</b><span>${dilPath === 'happy' ? 'signal → POs' : 'signal → protective action'}</span></div></div>
    <p class="tiny muted" style="margin-top:14px">Illustrative, from CONCEPT-IDEA §4. Times and quantities are examples.</p>`;
}
$('#dilSteps').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; dilIdx = +b.dataset.i; stopDil(); renderDil(); });
$('#dilTabs').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; dilPath = b.dataset.p; dilIdx = 0; $('#dilTabs').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderDil(); });
function stopDil() { clearInterval(dilTimer); dilTimer = null; $('#dilAuto').textContent = '▶ Auto-play'; }
$('#dilAuto').addEventListener('click', () => {
  if (dilTimer) return stopDil();
  $('#dilAuto').textContent = '❚❚ Pause';
  dilTimer = setInterval(() => { dilIdx = (dilIdx + 1) % DIL[dilPath].length; renderDil(); }, 2600);
});
renderDil();

// ---------- Scenarios ----------
$('#scenGrid').innerHTML = C.scenarios.map((s, i) => `
  <a class="card card-glow hover scen reveal ${['', 'd1', 'd2', 'd3'][i % 4]}" href="simulate.html?scenario=${s.n}">
    <span class="sn"><span>K${String(s.n).padStart(2, '0')}</span><span>${esc(strip(s.signals).split(',')[0])}</span></span>
    <h3>${esc(strip(s.name))}</h3>
    <div class="split2"><span class="a"><i>auto</i>${md(s.auto)}</span><span class="h"><i>human</i>${md(s.human)}</span></div>
    <span class="go">Inject into simulation →</span>
  </a>`).join('');

// ---------- Collapse ----------
const KEEP = new Set([3, 17, 29, 41, 58, 66, 80, 97, 113, 131]);
$('#appCloud').innerHTML = Array.from({ length: 140 }, (_, i) => `<i class="${KEEP.has(i) ? 'keep' : ''}"></i>`).join('');
$('#collapseBtn').addEventListener('click', () => {
  const on = $('#appCloud').classList.toggle('collapsed');
  $('#collapseBtn').textContent = on ? 'Restore the 140' : 'Collapse the portfolio';
  if (on) toast('130 applications retired · 10 rails remain');
});
table('#legacy', ['Legacy category', 'Replaced by', 'What stays external'], C.legacy.map(l => [l.category, l.by, l.external || '']));

// ---------- Roadmap & metrics ----------
$('#road').innerHTML = C.roadmap.map((r, i) => `
  <div style="--i:${i}"><span class="ph">${esc(r.phase.replace(/\s*\(.+\)/, ''))}</span><span class="tiny muted">${esc((/\((.+)\)/.exec(r.phase) || [])[1] || '')} · ${esc(r.autonomy)}</span>
  <p>${md(r.scope)}</p><div class="demo">${md(r.demo)}</div></div>`).join('');
$('#metrics').innerHTML = C.metrics.map((m, i) => `
  <div class="card metric reveal ${['', 'd1', 'd2', 'd3'][i % 4]}"><span class="k">${esc(strip(m.signal))}</span><span class="tg">${md(m.target)}</span><p>${md(m.measure)}</p><p class="tiny">${md(m.when)}</p></div>`).join('');

observeReveals();
