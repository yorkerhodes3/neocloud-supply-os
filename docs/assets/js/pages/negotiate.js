// Negotiation room page (DOM / UI). Pure logic lives in ../nego/*.js.
import { mountShell, toast, observeReveals } from '../shell.js';
import { esc } from '../lib/md.js';
import { SCENARIOS, SCENARIO_ORDER, REPLAY, getScenario } from '../nego/scenarios.js';
import { Negotiation, analyse, monteCarlo, STYLES, STYLE_ORDER, digitsFromOffer, mandateCheck } from '../nego/engine.js';
import { RULES, detectText } from '../nego/detector.js';
import { parseNDJSON, toNDJSON, exportPerspective, tickGaps, displayNameFor, readinessFromRecords, fixMojibake, perspectiveOptions } from '../nego/ndjson.js';

mountShell('negotiate');

const $ = (s, r = document) => r.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const f2 = (x) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(2));
const f3 = (x) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(3));
const tip = (html) => `data-tip="${esc(html)}"`;
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const SEAT_COLORS = ['--s1', '--s3', '--s4', '--s2', '--s5', '--s6'];
const STYLE_SHORT = { boulware: 'Boulware', linear: 'Linear', conceder: 'Conceder', tft: 'Tit-for-tat' };
const clampInt = (v, a, b, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };

// ------------------------------------------------------------------ state
const S = {
  scnId: 'odm-rack', seed: 42, style: null, ours: 'linear', rounds: 6,
  mode: 'synth', neg: null, A: null,
  replay: null, // { which, name, all, cursor, perspective, errors, det, parties, colors, synthetic }
  viewer: 'operator', tab: 'all',
  playing: false, timer: 0, speed: 2,
  items: new Map(), feedSig: '',
  mc: null,
};
const replayCache = {};

function readParams() {
  const q = new URLSearchParams(location.search);
  const scn = q.get('scenario');
  if (scn && SCENARIO_ORDER.includes(scn)) S.scnId = scn;
  S.seed = clampInt(q.get('seed'), 0, 999999, 42);
  const st = q.get('style'); const ou = q.get('ours');
  S.style = STYLE_ORDER.includes(st) ? st : null;
  if (STYLE_ORDER.includes(ou)) S.ours = ou;
  S.rounds = clampInt(q.get('rounds'), 3, 12, 6);
  const f = q.get('file'); if (f === 'aurora') S.replayWhich = 'aurora';
}

const scn = () => getScenario(S.scnId);
const isReplay = () => S.scnId === REPLAY.id;
const themStyle = () => S.style || (scn().defaultStyle ?? 'linear');

// ------------------------------------------------------------------ left column
function renderScenarioList() {
  $('#scnCount').textContent = `${SCENARIO_ORDER.length} tables`;
  $('#scnList').innerHTML = SCENARIO_ORDER.map((id) => {
    const s = getScenario(id);
    return `<button type="button" class="scn" data-scn="${id}" aria-pressed="${id === S.scnId}">
      <span class="code" aria-hidden="true">${esc(s.code)}</span><b>${esc(s.title)}</b><small>${esc(s.counterparty)}</small></button>`;
  }).join('');
}

function renderStyleSegs() {
  const seg = (sel, cur, key) => {
    $(sel).innerHTML = STYLE_ORDER.map((id) => `<button type="button" data-${key}="${id}" aria-pressed="${id === cur}" ${tip(`<b>${esc(STYLES[id].label)}</b><br>${esc(STYLES[id].blurb)}`)}>${STYLE_SHORT[id]}</button>`).join('');
  };
  seg('#segThem', themStyle(), 'them');
  seg('#segUs', S.ours, 'us');
  const sel = $('#rounds');
  if (!sel.options.length) sel.innerHTML = [3, 4, 5, 6, 8, 10, 12].map((n) => `<option value="${n}">${n} rounds${n === 3 ? ' · spec cap (proposed)' : n === 6 ? ' · demo default' : ''}</option>`).join('');
  sel.value = String(S.rounds);
  if (sel.value !== String(S.rounds)) { S.rounds = 6; sel.value = '6'; }
  $('#roundsNote').innerHTML = S.rounds <= 3
    ? 'FR-S2P-004 proposes at most 3 rounds, then escalate (proposed, to confirm under OQ-25).'
    : 'FR-S2P-004 proposes ≤3 rounds (to confirm). The demo defaults to 6 so the concession curves are visible.';
  $('#seed').value = String(S.seed);
}

function renderMandate() {
  const s = scn();
  if (isReplay()) {
    const R = S.replay;
    const h = R && R.all.find((r) => r.kind === 'header');
    const hp = h ? h.payload : {};
    $('#mandateTitle').textContent = 'Recording';
    const b = $('#mandateBadge'); b.className = 'badge'; b.textContent = R && R.synthetic ? 'synthetic' : 'recorded';
    $('#mandateBody').innerHTML = !R ? '<p class="small muted">Loading…</p>' : `
      <div class="m-id">${esc(R.name)}</div>
      <dl class="m-dl">
        <dt>title</dt><dd>${esc(fixMojibake(hp.title || '—'))}</dd>
        <dt>seats</dt><dd>${R.parties.map((p) => `<span style="color:var(${R.colors[p.teamTwinName]})">${esc(displayNameFor(p))}</span>`).join(' · ') || '—'}</dd>
        <dt>perspective</dt><dd>${esc(R.perspective)}${R.perspective !== 'operator' ? ' <span class="badge warn">locked</span>' : ''}</dd>
        <dt>redactions</dt><dd>${esc((hp.redactions || []).join(', ') || 'none')}</dd>
        <dt>withheld</dt><dd>${Number.isFinite(hp.withheldEntries) ? hp.withheldEntries : 0} entries</dd>
        <dt>records</dt><dd>${R.all.length}${R.errors.length ? ` · <span style="color:var(--risk)">${R.errors.length} bad line(s) skipped</span>` : ''}</dd>
      </dl>
      ${hp.sensitivity ? `<p class="tiny muted">${esc(fixMojibake(hp.sensitivity))}</p>` : ''}
      <div class="m-sc">No negotiation mandate in this record. The CoLab session is a three-seat table (buyer, seller, broker). It shows the transcript, redaction and detector mechanics, not our Policy Engine.</div>
      ${R.errors.length ? `<ul class="err-list tiny">${R.errors.slice(0, 4).map((e) => `<li>line ${e.line}: ${esc(e.msg)}</li>`).join('')}</ul>` : ''}`;
    return;
  }
  const m = s.mandate;
  const fails = new Set();
  const last = S.neg && S.neg.offers.them.length ? S.neg.offers.them[S.neg.offers.them.length - 1] : null;
  if (last && S.neg) for (const c of mandateCheck(S.neg.inst, last.d).failed) fails.add(c.id);
  $('#mandateTitle').textContent = 'Mandate';
  const b = $('#mandateBadge'); b.className = 'badge ok'; b.textContent = 'signed · FR-POL-005';
  $('#mandateBody').innerHTML = `
    <div class="m-id">${esc(m.id)}<small>${esc(m.version)}</small></div>
    <dl class="m-dl">
      <dt>issuer</dt><dd>${esc(m.issuer)}</dd>
      <dt>owner</dt><dd>${esc(m.humanOwner)}</dd>
      <dt>scope</dt><dd>${esc(m.scope)}</dd>
      <dt>supplier</dt><dd>${esc(s.counterparty)} · ${esc(m.supplierTier)}</dd>
      <dt>valid</dt><dd>${esc(m.validTo)}</dd>
    </dl>
    <div class="m-sc">${esc(m.shouldCost.label)}. Walk-away points come from should-cost and policy, not from the agent.</div>
    <ul class="m-rules" aria-label="Mandate caps">${m.rules.map((r) => `<li class="${fails.has(r.id) ? 'hit' : ''}" ${fails.has(r.id) ? tip('The supplier’s latest package breaks this cap') : ''}><span class="rid">${esc(r.id)}</span><span>${esc(r.label)}</span></li>`).join('')}
      <li><span class="rid">P</span><span>Prohibited: false deadlines, misrepresenting competing quotes, citing another supplier’s terms (FR-S2P-005, FR-ENV-007)</span></li></ul>
    <p class="tiny muted">${esc(s.blurb)}</p>`;
}

// ------------------------------------------------------------------ records, seats, perspective
const usId = () => (isReplay() ? null : scn().seats.find((s) => s.key === 'us').id);
function seats() {
  if (!isReplay()) return scn().seats.map((s) => ({ id: s.id, name: s.name, color: s.color, key: s.key, side: s.side, role: s.role }));
  const R = S.replay;
  return R ? R.parties.map((p) => ({ id: p.teamTwinName, name: displayNameFor(p), color: R.colors[p.teamTwinName], side: p.side, key: p.side })) : [];
}
const seatOf = (id) => seats().find((s) => s.id === id);
function nameOf(id) {
  if (!id) return '?';
  if (id.startsWith('human:')) return `${id.slice(6)} (human)`;
  const s = seatOf(id);
  if (s) return s.name;
  return { 'policy-engine': 'Policy Engine', envoy: 'Envoy', system: 'Table' }[id] || id;
}
const colorOf = (id) => (seatOf(id) || {}).color || '--muted';
const lockedPerspective = () => (isReplay() && S.replay && S.replay.perspective !== 'operator' ? S.replay.perspective : null);

function allRecords() {
  if (isReplay()) return S.replay ? S.replay.all.slice(0, S.replay.cursor) : [];
  return S.neg ? S.neg.records : [];
}
function viewRecords() {
  const all = allRecords();
  if (lockedPerspective()) return all;
  return S.viewer === 'operator' ? all : exportPerspective(all, S.viewer);
}
const chClass = (ch) => (!ch || ch === 'plenary' ? 'plenary' : ch.startsWith('brief-') ? 'brief' : 'caucus');

function renderViewAs() {
  const sel = $('#viewAs');
  const lock = lockedPerspective();
  let opts;
  if (lock) opts = [{ id: lock, label: `${nameOf(lock)} (file perspective)` }];
  else if (isReplay()) opts = S.replay ? perspectiveOptions(S.replay.all) : [{ id: 'operator', label: 'Operator (everything)' }];
  else {
    const lbl = { us: 'Us', them: 'Supplier', broker: 'Broker' };
    opts = [{ id: 'operator', label: 'Operator (everything)' }, ...scn().seats.map((s) => ({ id: s.id, label: `${lbl[s.key]} · ${s.name}` }))];
  }
  if (!opts.some((o) => o.id === S.viewer)) S.viewer = lock || 'operator';
  if (lock) S.viewer = lock;
  sel.innerHTML = opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
  sel.value = S.viewer;
  sel.disabled = !!lock;
  sel.title = lock ? 'Locked: this file is a perspective export; its view is fixed by the header' : '';
}

function viewNote(view) {
  const el = $('#viewNote');
  const gaps = tickGaps(view);
  const gapTxt = gaps.length ? `${gaps.length} tick gap${gaps.length > 1 ? 's' : ''} (${gaps.slice(0, 3).map((g) => (g.count === 1 ? g.from : `${g.from}–${g.to}`)).join(', ')}${gaps.length > 3 ? ', …' : ''})` : 'no tick gaps yet';
  const lock = lockedPerspective();
  if (lock) {
    const h = view.find((r) => r.kind === 'header');
    el.innerHTML = `<span class="lock">🔒 Locked</span> · perspective export from <b>${esc(nameOf(lock))}</b>’s seat. “View as” is fixed by the file header; ${h && Number.isFinite(h.payload.withheldEntries) ? `${h.payload.withheldEntries} entries were withheld at export` : 'records were withheld at export'}, ${gapTxt}.`;
  } else if (S.viewer === 'operator') {
    el.innerHTML = '<b>Operator view</b>: every channel and every private brief. No seat at the table sees this.';
  } else {
    const h = view.find((r) => r.kind === 'header');
    const w = h ? h.payload.withheldEntries : 0;
    el.innerHTML = `<b>Seat view as ${esc(nameOf(S.viewer))}</b>: filtered like a perspective export. ${w} record${w === 1 ? '' : 's'} withheld (${esc((h ? h.payload.redactions : []).join(', ') || 'none')}); ticks are not renumbered, so ${gapTxt} mark the redactions.`;
  }
}

// ------------------------------------------------------------------ feed items
const ISSUE_CACHE = new WeakMap();
function issueMap() {
  const s = scn();
  if (!ISSUE_CACHE.has(s)) ISSUE_CACHE.set(s, Object.fromEntries(s.issues.map((i) => [i.id, i])));
  return ISSUE_CACHE.get(s);
}
const showMandate = () => !isReplay() && (S.viewer === 'operator' || S.viewer === usId());

function offerHTML(offer, prev, withGate) {
  if (!offer || typeof offer !== 'object') return '';
  if (isReplay()) return `<div class="offer" aria-label="Offer">${Object.entries(offer).slice(0, 8).map(([k, v]) => `<span class="iv"><i>${esc(k)}</i>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span>`).join('')}</div>`;
  const im = issueMap();
  let gate = null, overIssues = new Set();
  if (withGate && S.neg) {
    gate = mandateCheck(S.neg.inst, digitsFromOffer(S.neg.inst, offer));
    const rules = Object.fromEntries(scn().mandate.rules.map((r) => [r.id, r]));
    for (const c of gate.failed) { const r = rules[c.id]; if (r) (r.issues || [r.issue]).forEach((x) => overIssues.add(x)); }
  }
  const chips = Object.entries(offer).map(([k, v]) => {
    const is = im[k]; if (!is) return '';
    const moved = prev && prev[k] !== v;
    return `<span class="iv ${moved ? 'moved' : ''} ${overIssues.has(k) ? 'over' : ''}"><i>${esc(is.short)}</i>${esc(is.fmt(v))}</span>`;
  }).join('');
  const g = gate ? (gate.ok
    ? `<span class="gate ok" ${tip('Policy Engine pre-check against the signed mandate caps')}>inside mandate ✓</span>`
    : `<span class="gate no" ${tip(esc(gate.failed.map((c) => `${c.id}: ${c.label}`).join(' · ')))}>outside mandate: ${esc(gate.failed.map((c) => c.id).join(', '))}</span>`) : '';
  return `<div class="offer" aria-label="Offer">${chips}${g}</div>`;
}

function tacChip(t, recorded) {
  const ph = t.ruleId === 'R0' || t.placeholder || (recorded && t.tacticId === 'positional-statement');
  const conf = Number.isFinite(t.confidence) ? t.confidence.toFixed(2) : '–';
  const rationale = fixMojibake(t.rationale || '');
  const label = t.label || t.tacticId;
  const src = recorded ? 'recorded by the upstream CoLab detector (its own rule numbering)' : 'NSO rule-based detector';
  const html = `<b>${esc(t.ruleId || '?')} · ${esc(label)}</b>${t.prohibited ? ' · <b>prohibited</b>' : ''}<br>${esc(rationale)}<br><i>confidence ${conf} · ${src}</i>`;
  return `<span class="chip tac ${ph ? 'ph' : ''} ${t.prohibited ? 'prohibited' : ''} ${recorded ? 'rec' : ''}" tabindex="0" ${tip(html)}>${recorded ? '<span class="r">rec</span>' : ''}<span class="r">${esc(t.ruleId || '')}</span>${esc(t.tacticId)}<span class="c">${conf}</span><span class="sr-only">. ${esc(rationale)}</span></span>`;
}

function priceSignals(text) {
  const out = [];
  const rx = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?[kKmM]\b)?/g;
  let m;
  while ((m = rx.exec(text))) if (!m[2]) out.push(Number(m[1].replace(/,/g, '')));
  return out;
}

function moveHTML(r, tacs, prevOffer) {
  const p = r.payload;
  const who = p.partyTwin || r.actor;
  const color = colorOf(who);
  const c = chClass(r.channel);
  const human = p.authoredBy === 'human';
  const kind = String(p.kind || 'message');
  const isUs = who === usId();
  const recTacs = (tacs || []).map((t) => tacChip(t, isReplay() && !(S.replay && S.replay.synthetic)));
  const ours = isReplay() && S.replay && !S.replay.synthetic ? (S.replay.det.get(p.id) || []).map((d) => tacChip({ ruleId: d.rule, tacticId: d.tag, confidence: d.confidence, rationale: d.rationale, prohibited: d.prohibited, label: d.label, placeholder: d.placeholder }, false)) : [];
  let priceChips = '';
  if (isReplay() && p.text) {
    const ps = S.replay.priceOf.get(p.id);
    if (ps != null) priceChips = `<div class="offer"><span class="iv" ${tip('Regex-extracted from the recorded text; illustrative only')}><i>price</i>$${ps}</span></div>`;
  }
  const src = isReplay() ? (S.replay.synthetic ? 'template text' : 'recorded text') : human ? 'simulated human · template text' : 'template-generated text, no LLM';
  return `<article class="mv ${isUs ? 'us' : ''} ${c === 'caucus' ? 'caucus' : ''} ${human ? 'human' : ''}" style="--seat:var(${color})" aria-label="${esc(`${nameOf(who)}, round ${r.round}, ${kind}`)}">
    <div class="mv-h"><span class="badge" title="Round ${r.round}">Rd ${r.round}</span><span class="tk">tick ${r.tick}</span><span class="who">${esc(human ? `${nameOf(r.actor)} for NSO` : nameOf(who))}</span>
      <span class="kind ${kind === 'accept' ? 'accept' : kind === 'walk' || kind === 'walkaway' ? 'walk' : ''}">${esc(kind)}</span>
      ${c !== 'plenary' ? `<span class="ch">${c === 'caucus' ? '⧉ caucus' : '◐ brief'} · ${esc(r.channel)}</span>` : ''}
      <span class="spacer"></span><span class="mv-src">${src}</span></div>
    ${offerHTML(p.offer, prevOffer, showMandate())}${priceChips}
    ${p.text ? `<p class="mv-text">${esc(fixMojibake(p.text))}</p>` : ''}
    ${recTacs.length || ours.length ? `<div class="tacs" aria-label="Detected tactics">${recTacs.join('')}${ours.join('')}</div>` : ''}
  </article>`;
}

const OUTCOME_LBL = { allow: 'allow · within mandate ✓', escalate: 'ESCALATE · beyond mandate → named human', deny: 'deny', 'allow-override': 'allow · human override (HITL-04)' };

function evHTML(r, view) {
  const p = r.payload;
  switch (r.kind) {
    case 'header': {
      const n = (p.parties || []).length;
      return `<div class="ev"><span class="ic">◆</span><span><b>Session opened</b> · ${esc(fixMojibake(p.title || p.scenarioId || 'untitled'))} · ${n} seat${n === 1 ? '' : 's'} · ${p.synthetic ? 'synthetic' : 'recorded'} · perspective <b>${esc(p.perspective || 'operator')}</b>${p.generator ? ` · generator <code>${esc(p.generator)}</code>` : ''}</span></div>`;
    }
    case 'assessment': {
      const who = p.partyTwin || r.actor;
      const acTip = 'AC_next: accept if the incoming offer is worth at least as much to me as the offer I would send next, and is above my reservation.';
      return `<div class="ev brief" style="--seat:var(${colorOf(who)})"><span class="ic">◐</span><span><b class="who">${esc(nameOf(who))}</b> private brief · t=${f2(p.t)} · target ${f2(p.target)} · reservation ${f2(p.reservation)}${p.uIncoming != null ? ` · incoming ${f2(p.uIncoming)} vs next ${f2(p.uNext)}` : ''} · <span ${tip(esc(acTip))}>${esc(p.rule || 'AC_next')}</span> → <b>${esc(p.decision)}</b>${p.overMandate ? ' · <b style="color:var(--warn)">over mandate</b>' : ''}</span></div>`;
    }
    case 'policy': {
      const o = p.outcome || 'allow';
      const cls = o === 'escalate' ? 'escalate' : o === 'deny' ? 'deny' : 'allow';
      const checks = (p.checks || []).map((c) => `${c.ok ? '✓' : '✗'} ${esc(c.id)} ${esc(c.label)}`).join('<br>');
      return `<div class="ev ${cls}"><span class="ic">⛨</span><span><b>Policy Engine</b> · ${esc(p.command)}${p.moveRef ? ` (${esc(p.moveRef)})` : ''}: <span class="o">${esc(OUTCOME_LBL[o] || o)}</span> · <span ${tip(`<b>${esc(p.mandateRef || '')}</b><br>${checks}`)}>${(p.checks || []).length} checks</span></span>${o !== 'allow' && p.reasons ? `<span class="why">${esc(p.reasons.join(' · '))}</span>` : ''}</div>`;
    }
    case 'escalate': {
      if (!p.blocking) return `<div class="ev flag"><span class="ic">⚑</span><span><b>Raised for ${esc(p.approver || 'a named human')}</b> (${esc(p.hitl || 'raise-item')}) · ${esc((p.reasons || []).join(' · '))}</span></div>`;
      const decision = view.find((x) => x.kind === 'human_decision' && x.payload.escalationId === p.id);
      const live = !decision && S.neg && S.neg.pending && S.neg.pending.escId === p.id;
      const st = decision ? `${decision.payload.decision === 'approve' ? 'Approved' : 'Denied'} by ${esc(decision.payload.approver)}` : live ? 'Waiting for a human decision. Nothing has been sent.' : 'Parked: no human decided before the session ended.';
      return `<div class="esc-card ${live ? '' : 'decided'}" role="group" aria-label="Escalation ${esc(p.id)}">
        <h5>⚠ Escalate · ${esc(p.hitl || 'HITL-04')} · ${esc(p.id)}</h5>
        <p><b>${esc(p.approver || 'Named human')}</b>: ${esc(fixMojibake(p.note || ''))}</p>
        ${offerHTML(p.offer, null, showMandate())}
        <p class="small">${esc((p.reasons || []).join(' · '))} · our utility ${f2(p.uIncoming)}</p>
        ${live ? `<div class="row"><button type="button" class="btn sm primary" data-decide="approve">Approve as ${esc(String(p.approver || 'human').split('·')[0].trim())}</button><button type="button" class="btn sm deny" data-decide="deny">Deny</button><span class="tiny muted">simulated human decision</span></div>` : `<p class="tiny muted">${st}</p>`}
      </div>`;
    }
    case 'human_decision': {
      const ok = p.decision === 'approve';
      return `<div class="ev ${ok ? 'allow' : 'deny'}"><span class="ic">◉</span><span><b>${esc(String(p.approver || r.actor).split('·')[0].trim())}</b> (human) <span class="o">${ok ? 'approved' : 'denied'}</span> ${esc(p.escalationId || '')} · ${esc(p.hitl || '')}${p.simulated ? ' · simulated' : ''}</span>${p.note ? `<span class="why">${esc(p.note)}</span>` : ''}</div>`;
    }
    case 'envoy':
      return `<div class="ev ${p.action === 'quarantine' ? 'quarantine' : 'flag'}"><span class="ic">⊘</span><span><b>Envoy</b> · ${esc(p.action)} ${esc(p.moveId || '')} from ${esc(nameOf(p.partyTwin))} · ${esc(p.ruleId || '')}</span><span class="why">${esc(p.note || '')}</span></div>`;
    default:
      return `<div class="ev"><span class="ic">·</span><span><b>${esc(r.kind)}</b> · ${esc(nameOf(r.actor))}</span></div>`;
  }
}

const STATUS_BIG = { settled: 'Settled', approved: 'Approved by a human', escalated: 'Escalated · parked', walked: 'Walked away', agreement: 'Agreement', concluded: 'Concluded' };
function outcomeHTML(r) {
  const p = r.payload;
  const st = p.reason || p.status || 'concluded';
  const sb = Array.isArray(p.scoreboard) ? p.scoreboard : [];
  const scores = sb.map((s) => `<b style="color:var(${colorOf(s.teamTwinName)})">${esc(nameOf(s.teamTwinName))}</b> ${s.withheld ? '<i>withheld</i>' : s.satisfaction == null ? '—' : f2(s.satisfaction)}`).join(' · ');
  const oa = p.operatorAnalysis;
  const ag = p.agreement && p.agreement.offer ? offerHTML(p.agreement.offer, null, showMandate()) : '';
  return `<div class="end-card ${esc(st)}" role="status">
    <span class="eyebrow">Outcome${p.scrubbedFor ? ` · scrubbed for ${esc(nameOf(p.scrubbedFor))}` : ''}</span>
    <div class="big">${esc(STATUS_BIG[st] || st)}</div>
    ${ag}
    <p>${scores ? `Satisfaction: ${scores}` : ''}</p>
    ${oa ? `<p class="tiny muted">Operator analysis · joint utility ${f2(oa.jointUtility)} · distance to Nash ${f3(oa.distanceToNash)} · ${esc(oa.settleability && oa.settleability.label || '')}</p>` : ''}
    ${p.approvedByHuman ? '<p class="tiny">Approved above the agent’s mandate by a named human. Recorded as a mandate override.</p>' : ''}
    ${Array.isArray(p.prohibitedTactics) && p.prohibitedTactics.length ? `<p class="tiny" style="color:var(--risk)">Prohibited tactics flagged for the Auditor: ${p.prohibitedTactics.map((t) => `${esc(t.ruleId)} ${esc(t.tag)} (${esc(nameOf(t.partyTwin))})`).join(', ')}</p>` : ''}
  </div>`;
}

function buildItems(view) {
  const items = [];
  const tacs = new Map();
  for (const r of view) if (r.kind === 'tactic') for (const id of r.payload.evidenceMoveIds || []) { if (!tacs.has(id)) tacs.set(id, []); tacs.get(id).push(r.payload); }
  const lastOffer = {};
  let prev = null;
  for (const r of view) {
    if (prev != null && r.tick > prev + 1) {
      const a = prev + 1, b = r.tick - 1;
      items.push({ k: `gap-${a}-${b}`, cls: 'gap', html: `<div class="gap" role="note"><span>⋯ ${a === b ? `tick ${a}` : `ticks ${a}–${b}`} withheld from this view</span></div>` });
    }
    prev = r.tick;
    const c = chClass(r.channel);
    let html = null, cls = c;
    if (r.kind === 'move') {
      const who = r.payload.partyTwin || r.actor;
      html = moveHTML(r, tacs.get(r.payload.id), lastOffer[who]);
      if (r.payload.offer) lastOffer[who] = r.payload.offer;
    } else if (r.kind === 'round_begin') {
      const p = r.payload;
      html = `<div class="rd"><span><b>${p.label ? esc(p.label) : `Round ${esc(p.roundNumber)}`}</b>${p.roundNumber ? ` · round ${esc(p.roundNumber)}${p.maxRounds ? ` of ${esc(p.maxRounds)}` : ''}` : ''}</span></div>`;
      cls = 'all';
    } else if (r.kind === 'outcome') { html = outcomeHTML(r); cls = 'all'; }
    else if (['header', 'assessment', 'policy', 'escalate', 'human_decision', 'envoy'].includes(r.kind)) html = evHTML(r, view);
    else if (!['tactic', 'turn_begin', 'round_end', 'round_summary', 'session_status', 'context'].includes(r.kind)) html = evHTML(r, view);
    if (html) items.push({ k: `t${r.tick}`, cls, html });
  }
  return items;
}

function renderTabs(items) {
  const n = { all: 0, plenary: 0, caucus: 0, brief: 0 };
  for (const it of items) if (n[it.cls] != null) { n[it.cls]++; n.all++; }
  const tabs = [['all', 'All visible'], ['plenary', 'Plenary'], ['caucus', 'Caucus'], ['brief', 'Private brief']];
  $('#tabs').innerHTML = tabs.map(([id, l]) => `<button type="button" role="tab" class="tab" id="tab-${id}" aria-controls="feed" aria-selected="${S.tab === id}" tabindex="${S.tab === id ? 0 : -1}" data-tab="${id}">${l}<span class="n">${n[id]}</span></button>`).join('');
}

function emptyFeed() {
  const s = scn();
  if (isReplay() && !S.replay) return '<div class="feed-empty"><b>Loading…</b></div>';
  const what = isReplay() ? 'Press Play to replay the recording, or Step through it move by move.' : `Press Play to open the RFQ with ${esc(s.counterparty)}, or Step through it move by move.`;
  return `<div class="feed-empty"><b>The table is set.</b><span>${what}</span></div>`;
}

function emptyTab() {
  const lock = lockedPerspective();
  const msg = {
    caucus: S.viewer !== 'operator' || lock ? 'No caucus is visible from this seat. If one happened, its ticks show as gaps in “All visible”.' : 'No caucus channel in this session (yet).',
    brief: isReplay() && !(S.replay && S.replay.synthetic) ? 'This file has no private-brief records. In the Diplomacy Table, team twins hold their briefs in isolation and they are not exported.' : 'No private-brief records visible from this view yet.',
    plenary: 'Nothing on the plenary yet.',
  }[S.tab] || '';
  return `<div class="feed-empty"><span>${esc(msg)}</span></div>`;
}

/** Append-only feed update; full rebuild when view/tab changes. */
function renderFeed(view, force = false) {
  const feed = $('#feed');
  const items = buildItems(view);
  renderTabs(items);
  const shown = items.filter((it) => S.tab === 'all' || it.cls === S.tab || it.cls === 'all' || it.cls === 'gap');
  const sig = `${S.scnId}|${S.viewer}|${S.tab}|${S.mode}|${S.replay ? S.replay.name : ''}`;
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  if (force || sig !== S.feedSig) {
    S.feedSig = sig;
    S.items = new Map();
    feed.setAttribute('aria-busy', 'true');
    feed.innerHTML = '';
  }
  if (!view.length) { feed.innerHTML = emptyFeed(); S.items = new Map(); feed.removeAttribute('aria-busy'); return; }
  const real = shown.filter((it) => it.cls !== 'all' && it.cls !== 'gap');
  if (!real.length && S.tab !== 'all') { feed.innerHTML = emptyTab(); S.items = new Map(); feed.removeAttribute('aria-busy'); return; }
  if (feed.querySelector('.feed-empty')) { feed.innerHTML = ''; S.items = new Map(); }
  const frag = document.createDocumentFragment();
  for (const it of shown) {
    const cur = S.items.get(it.k);
    if (cur && cur.html === it.html) continue;
    const tpl = document.createElement('template');
    tpl.innerHTML = it.html.trim();
    const el = tpl.content.firstElementChild;
    el.dataset.k = it.k;
    if (cur) cur.el.replaceWith(el); else frag.appendChild(el);
    S.items.set(it.k, { html: it.html, el });
  }
  feed.appendChild(frag);
  feed.removeAttribute('aria-busy');
  if (atBottom || force) feed.scrollTop = feed.scrollHeight;
  const moves = view.filter((r) => r.kind === 'move').length;
  const tacN = view.filter((r) => r.kind === 'tactic').length;
  const gaps = tickGaps(view).length;
  $('#feedFoot').innerHTML = `<span>${view.length} records</span><span>${moves} moves</span><span>${tacN} tactic tags</span><span>last tick ${view.length ? view[view.length - 1].tick : '–'}</span>${gaps ? `<span style="color:var(--warn)">${gaps} gap${gaps > 1 ? 's' : ''}</span>` : ''}`;
}

// ------------------------------------------------------------------ utility-space plot
const PL = { L: 46, R: 14, T: 14, B: 40, W: 400, H: 400 };
const px = (u) => PL.L + u * (PL.W - PL.L - PL.R);
const py = (u) => PL.T + (1 - u) * (PL.H - PL.T - PL.B);
const r1 = (x) => Math.round(x * 10) / 10;
const DESC = '<desc id="plotDesc">Our utility on the x axis and the counterpart’s on the y axis, both 0 to 1. Dots are possible packages; the dashed line is the Pareto frontier; the diamond is the Nash bargaining point; dashed straight lines are each side’s reservation utility; coloured paths are each side’s offers.</desc>';

function axesSVG(xl, yl, xt = [0, 0.25, 0.5, 0.75, 1], yt = xt, fx = (v) => v, fy = (v) => v) {
  const g = [];
  for (const v of xt) g.push(`<line class="gl" x1="${r1(px(fx(v)))}" x2="${r1(px(fx(v)))}" y1="${py(0)}" y2="${py(1)}"/><text class="tl" x="${r1(px(fx(v)))}" y="${py(0) + 14}" text-anchor="middle">${typeof v === 'number' && v <= 1 ? v : v}</text>`);
  for (const v of yt) g.push(`<line class="gl" x1="${px(0)}" x2="${px(1)}" y1="${r1(py(fy(v)))}" y2="${r1(py(fy(v)))}"/><text class="tl" x="${px(0) - 6}" y="${r1(py(fy(v))) + 3}" text-anchor="end">${v}</text>`);
  g.push(`<line class="ax" x1="${px(0)}" x2="${px(1)}" y1="${py(0)}" y2="${py(0)}"/><line class="ax" x1="${px(0)}" x2="${px(0)}" y1="${py(0)}" y2="${py(1)}"/>`);
  g.push(`<text class="al" x="${(px(0) + px(1)) / 2}" y="${PL.H - 6}" text-anchor="middle">${esc(xl)}</text>`);
  g.push(`<text class="al" transform="translate(12 ${(py(0) + py(1)) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>`);
  return g.join('');
}

let plotStaticCache = '';
function plotStaticSynth() {
  const A = S.A, inst = S.neg.inst, s = scn();
  const them = s.seats.find((x) => x.key === 'them');
  const cloud = A.cloud.map((p) => `<circle class="cl ${p.ok ? 'ok' : ''}" cx="${r1(px(p.x))}" cy="${r1(py(p.y))}" r="1.5"/>`).join('');
  const fr = A.frontier.map((p, i) => `${i ? 'L' : 'M'}${r1(px(p.x))} ${r1(py(p.y))}`).join('');
  const ru = inst.res.us, rt = inst.res.them;
  const n = A.nash;
  return `${axesSVG('our utility (NSO Negotiator) →', `their utility (${them.name}) →`)}
    <g class="op"><rect class="zopa" x="${r1(px(ru))}" y="${py(1)}" width="${r1(px(1) - px(ru))}" height="${r1(py(rt) - py(1))}"/>
    <g>${cloud}</g><path class="front" d="${fr}"/></g>
    <line class="res res-us" x1="${r1(px(ru))}" x2="${r1(px(ru))}" y1="${py(0)}" y2="${py(1)}"/><text class="tl rl" x="${r1(px(ru)) + 4}" y="${py(1) + 10}" style="fill:var(--s1)">our reservation ${f2(ru)}</text>
    <g class="op-them"><line class="res res-them" x1="${px(0)}" x2="${px(1)}" y1="${r1(py(rt))}" y2="${r1(py(rt))}"/><text class="tl rl" x="${px(1) - 4}" y="${r1(py(rt)) - 5}" text-anchor="end" style="fill:var(--s3)">their reservation ${f2(rt)}</text></g>
    ${n ? `<g class="op"><path class="nash" d="M${r1(px(n.x))} ${r1(py(n.y)) - 6}l6 6l-6 6l-6 -6z"/><text class="nash-l" x="${r1(px(n.x)) + 9}" y="${r1(py(n.y)) - 7}">Nash</text></g>` : ''}`;
}

function plotDynSynth(newest) {
  const o = S.neg.offers, out = [];
  const sideSeat = { us: scn().seats.find((x) => x.key === 'us'), them: scn().seats.find((x) => x.key === 'them'), broker: scn().seats.find((x) => x.key === 'broker') };
  for (const side of ['broker', 'them', 'us']) {
    const pts = o[side] || []; const seat = sideSeat[side];
    if (!pts.length || !seat) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(px(p.x))} ${r1(py(p.y))}`).join('');
    out.push(`<path class="trj" d="${d}" style="stroke:var(${seat.color})"/>`);
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      out.push(`<circle class="trj-pt ${last ? 'last' : ''} ${newest.has(p.moveId) && !reduceMotion.matches ? 'anim' : ''}" cx="${r1(px(p.x))}" cy="${r1(py(p.y))}" r="${last ? 4.6 : 3.2}" style="fill:var(${seat.color})"><title>${esc(seat.name)} · round ${p.round} · ${esc(p.moveId)} · U_us ${f2(p.x)} · U_them ${f2(p.y)}${p.ok ? '' : ' · outside mandate'}</title></circle>`);
    });
  }
  const R = S.neg.result;
  if (S.neg.done && R && R.agreement) {
    const a = R.agreement;
    out.push(`<circle class="agree ${a.ok ? '' : 'over'}" cx="${r1(px(a.x))}" cy="${r1(py(a.y))}" r="10"/><circle class="agree pulse ${a.ok ? '' : 'over'}" cx="${r1(px(a.x))}" cy="${r1(py(a.y))}" r="10"/><text class="nash-l" x="${r1(px(a.x)) - 12}" y="${r1(py(a.y)) + 22}" text-anchor="middle">${R.approved ? 'deal (human)' : 'deal'}</text>`);
  }
  return out.join('');
}

function renderPlotSynth(newest = new Set()) {
  const seatView = S.viewer !== 'operator';
  const svg = $('#plot');
  svg.innerHTML = `${DESC}<g class="${seatView ? 'seatview' : ''}">${plotStaticCache}</g><g id="dyn">${plotDynSynth(newest)}</g>${seatView ? `<text class="veil-t" x="${px(0) + 6}" y="${py(0) - 8}">operator ground truth · dimmed: a seat has only its own axis</text>` : ''}`;
  if (seatView) svg.querySelectorAll('.op, .op-them').forEach((g) => g.classList.add('dim'));
  $('#plotTitle').textContent = 'Utility space';
  $('#plotTag').textContent = seatView ? `seat view · ${nameOf(S.viewer)}` : 'operator analysis';
  const s = scn();
  $('#legend').innerHTML = [
    ...s.seats.map((x) => `<span style="--seat:var(${x.color})"><i></i>${esc(x.name)}</span>`),
    '<span style="--seat:var(--accent)"><i class="dot"></i>inside mandate</span>',
    '<span style="--seat:var(--muted)"><i class="dot"></i>outside</span>',
    '<span style="--seat:var(--fg)"><i class="dash"></i>Pareto frontier</span>',
    '<span>◇ Nash point</span>',
    '<span style="--seat:var(--ok)"><i class="dot"></i>ZOPA (shaded)</span>',
  ].join('');
}

function renderPlotReplay(view) {
  const R = S.replay, svg = $('#plot');
  $('#plotTitle').textContent = 'Price signals';
  $('#plotTag').textContent = 'illustrative · regex from text';
  if (!R) { svg.innerHTML = DESC; return; }
  const series = new Map();
  for (const r of view) {
    if (r.kind !== 'move') continue;
    const v = R.priceOf.get(r.payload.id);
    if (v == null) continue;
    const who = r.payload.partyTwin || r.actor;
    if (!series.has(who)) series.set(who, []);
    series.get(who).push({ round: r.round, v, tick: r.tick });
  }
  const maxRound = Math.max(1, R.maxRound);
  const vals = [...R.priceOf.values()];
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const fx = (rd) => (rd - 1) / Math.max(1, maxRound - 1);
  const fy = (v) => (v - lo) / (hi - lo);
  const xt = Array.from({ length: maxRound }, (_, i) => i + 1).filter((v, i, a) => a.length <= 10 || i % 2 === 0);
  const ytv = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo));
  const yt = ytv.map((v) => (hi - lo > 20 ? Math.round(v) : Math.round(v * 100) / 100));
  const out = [axesSVG('round →', 'price signal ($/unit) →', xt, yt, fx, fy)];
  for (const [who, pts] of series) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(px(fx(p.round)))} ${r1(py(fy(p.v)))}`).join('');
    out.push(`<path class="trj" d="${d}" style="stroke:var(${colorOf(who)})"/>`);
    pts.forEach((p, i) => out.push(`<circle class="trj-pt ${i === pts.length - 1 ? 'last' : ''}" cx="${r1(px(fx(p.round)))}" cy="${r1(py(fy(p.v)))}" r="3.4" style="fill:var(${colorOf(who)})"><title>${esc(nameOf(who))} · round ${p.round} · tick ${p.tick} · $${p.v}</title></circle>`));
  }
  if (!R.priceOf.size) out.push(`<text class="veil-t" x="${px(0.5)}" y="${py(0.5)}" text-anchor="middle">no $ price signals found in this file’s text</text>`);
  out.push(`<text class="veil-t" x="${px(0) + 6}" y="${py(1) + 10}">no utilities in the record → no utility space</text>`);
  svg.innerHTML = DESC + out.join('');
  $('#legend').innerHTML = R.parties.map((p) => `<span style="--seat:var(${R.colors[p.teamTwinName]})"><i></i>${esc(displayNameFor(p))}</span>`).join('') + '<span>first $ amount per move</span>';
}

// ------------------------------------------------------------------ readiness, settleability, scoreboard
function renderReadiness() {
  let src;
  if (isReplay()) src = S.replay ? (lockedPerspective() || S.viewer === 'operator' ? S.replay.all : exportPerspective(S.replay.all, S.viewer)) : [];
  else src = S.viewer === 'operator' ? S.ctxRecs : exportPerspective(S.ctxRecs, S.viewer);
  const rd = readinessFromRecords(src);
  const okN = rd.inputs.filter((i) => i.ok).length;
  const b = $('#readyBadge');
  b.className = `badge ${rd.ready ? 'ok' : 'warn'}`;
  b.textContent = `${okN} / 5`;
  $('#ready').innerHTML = rd.inputs.map((i) => `<li><span class="ck ${i.ok ? 'y' : 'n'}" aria-label="${i.ok ? 'present' : 'missing'}">${i.ok ? '✓' : '✗'}</span><span>${esc(i.label)}</span><small>${esc(i.note)}</small></li>`).join('') || '<li class="muted">No context record.</li>';
  const el = $('#settle');
  if (!isReplay() && rd.ready && S.A) {
    const st = S.A.settle;
    const expl = {
      settleable: 'Both sides’ acceptable sets overlap inside the mandate, so a deal exists that clears both reservations and the cap.',
      'needs-human': 'The acceptable sets overlap only outside the mandate. Any deal needs a named human (HITL-04).',
      disjoint: 'The acceptable sets are disjoint, so the deal is not settleable by construction. No tactic fixes that.',
    }[st.status];
    el.className = `settle ${st.status}`;
    el.innerHTML = `<b>${esc(st.label)}</b>ZOPA exists: <strong>${S.A.zopa.toLocaleString('en-US')}</strong> of ${S.A.N.toLocaleString('en-US')} packages clear both reservations, and <strong>${S.A.zopaOk.toLocaleString('en-US')}</strong> of them are inside the mandate. ${expl}`;
  } else if (!isReplay()) {
    el.className = 'settle unknown';
    el.innerHTML = '<b>Not computable from this seat</b>The counterpart’s reservation, BATNA and weights stay in its private brief. A seat can estimate them; only the operator can compute a ZOPA.';
  } else {
    el.className = 'settle unknown';
    el.innerHTML = `<b>Unknown · readiness ${okN} of 5</b>ZOPA and settleability need all five authored inputs. Nothing is inferred from prose: priorities aren’t weights, and red lines aren’t priced reservations.`;
  }
}

function renderScore(view) {
  const ends = view.filter((r) => r.kind === 'round_end');
  const last = ends[ends.length - 1];
  const out = view.find((r) => r.kind === 'outcome');
  const scores = (out && Array.isArray(out.payload.scoreboard) ? out.payload.scoreboard : last ? last.payload.scores : null) || [];
  $('#scoreRound').textContent = out ? 'final' : last ? `after round ${last.payload.roundNumber}` : 'not started';
  const rows = scores.map((s) => `<tr style="--seat:var(${colorOf(s.teamTwinName)})"><td class="who">${esc(nameOf(s.teamTwinName))}</td>
    <td>${s.withheld ? '<span class="wh">withheld</span>' : s.role === 'mediator' || s.satisfaction == null ? '<span class="wh">mediator</span>' : f2(s.satisfaction)}</td>
    <td>${s.agreementsWon ?? '–'}</td><td>${s.withheld ? '<span class="wh">–</span>' : s.redLinesCrossed ?? '–'}</td></tr>`).join('');
  const redTotal = scores.reduce((a, s) => a + (Number.isFinite(s.redLinesCrossed) ? s.redLinesCrossed : 0), 0);
  let kv = '';
  if (!isReplay() && S.neg) {
    const n = S.neg, R = n.result, op = S.viewer === 'operator';
    const st = n.pending ? ['Waiting for human', 'warn'] : R ? [STATUS_BIG[R.status] || R.status, R.status === 'settled' || R.status === 'approved' ? 'ok' : R.status === 'walked' ? 'risk' : 'warn'] : [n.records.length ? 'In progress' : 'Ready', ''];
    kv = `<div class="kv">
      <div class="${st[1]}"><b>${esc(st[0])}</b><span>status</span></div>
      <div><b>${R ? R.roundsUsed : n.records.length ? Math.max(0, ...n.records.map((r) => r.round)) : 0}<small style="font-size:.6em"> / ${n.inst.rounds}</small></b><span>rounds used</span></div>
      <div><b>${R && op ? f2(R.joint) : '–'}</b><span>joint utility${op ? '' : ' (operator only)'}</span></div>
      <div><b>${R && op ? f3(R.distNash) : '–'}</b><span>distance to Nash${op ? '' : ' (operator only)'}</span></div>
      <div class="${redTotal ? 'risk' : 'ok'}"><b>${redTotal}</b><span>red lines crossed</span></div>
      <div class="${(R && R.escalations) || n.pending ? 'warn' : ''}"><b>${R ? R.escalations : n.escalations || 0}</b><span>escalations to a human</span></div>
      ${showMandate() ? `<div class="wide ${R && R.agreement && !R.agreement.ok ? 'warn' : ''}"><span>mandate status</span><span style="color:var(--fg);font-size:.72rem">${esc(R ? R.mandateStatus : n.pending ? 'Package over cap: parked for HITL-04, nothing sent' : 'All our offers pass the Policy Engine gate so far')}</span></div>` : ''}
    </div>`;
  } else if (isReplay() && S.replay) {
    const ss = view.find((r) => r.kind === 'session_status');
    const rounds = Math.max(0, ...view.map((r) => r.round || 0));
    kv = `<div class="kv">
      <div><b>${esc(ss ? ss.payload.status : S.replay.cursor >= S.replay.all.length ? 'ended' : 'replaying')}</b><span>session</span></div>
      <div><b>${rounds}<small style="font-size:.6em"> / ${S.replay.maxRound}</small></b><span>rounds</span></div>
      <div><b>${view.filter((r) => r.kind === 'move').length}</b><span>moves visible</span></div>
      <div class="${redTotal ? 'risk' : 'ok'}"><b>${redTotal}</b><span>red lines crossed</span></div>
    </div>`;
  }
  $('#score').innerHTML = `${rows ? `<table class="sb"><thead><tr><th scope="col">Seat</th><th scope="col" ${tip('Each seat’s own utility for the other side’s latest offer (or for the agreement)')}>Utility</th><th scope="col">Deals</th><th scope="col">Red lines</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="tiny muted">No scores yet.</p>'}${kv}`;
}

// ------------------------------------------------------------------ update loop
function renderRunState() {
  let st = 'ready';
  if (isReplay()) {
    const R = S.replay;
    st = !R ? 'loading' : R.cursor >= R.all.length ? 'end of file' : S.playing ? 'replaying' : R.cursor ? 'paused' : 'ready';
  } else if (S.neg) st = S.neg.pending ? 'waiting for a human' : S.neg.done ? 'finished' : S.playing ? 'playing' : S.neg.records.length ? 'paused' : 'ready';
  $('#runState').textContent = st;
  const done = isReplay() ? !S.replay || S.replay.cursor >= S.replay.all.length : !S.neg || S.neg.done || !!S.neg.pending;
  const play = $('#btnPlay');
  play.textContent = S.playing ? '❚❚ Pause' : done && !(S.neg && S.neg.pending) ? '▶ Replay' : '▶ Play';
  play.setAttribute('aria-pressed', String(S.playing));
  play.disabled = !!(S.neg && S.neg.pending && !isReplay());
  $('#btnStep').disabled = done;
}

function update({ force = false, newest } = {}) {
  const view = viewRecords();
  renderFeed(view, force);
  viewNote(view);
  if (isReplay()) renderPlotReplay(view); else if (S.neg) renderPlotSynth(newest || new Set());
  renderReadiness();
  renderScore(view);
  renderMandate();
  renderRunState();
  renderExport();
}

function announce(view) {
  const mv = [...view].reverse().find((r) => r.kind === 'move');
  const out = view.find((r) => r.kind === 'outcome');
  const esc1 = S.neg && S.neg.pending ? ' Escalated: waiting for a human decision.' : '';
  $('#announce').textContent = out ? `Outcome: ${STATUS_BIG[out.payload.reason || out.payload.status] || out.payload.status}.` : mv ? `Round ${mv.round}, ${nameOf(mv.payload.partyTwin || mv.actor)}: ${mv.payload.kind}.${esc1}` : '';
}

function stepOnce() {
  if (isReplay()) {
    const R = S.replay;
    if (!R || R.cursor >= R.all.length) return false;
    let i = R.cursor, saw = false;
    while (i < R.all.length) { const r = R.all[i]; if (saw && r.kind !== 'tactic') break; if (r.kind === 'move') saw = true; i++; }
    R.cursor = i;
    update();
    announce(viewRecords());
    return R.cursor < R.all.length;
  }
  const n = S.neg;
  if (!n || n.done || n.pending) return false;
  const before = n.records.length;
  n.step();
  const newest = new Set(n.records.slice(before).filter((r) => r.kind === 'move').map((r) => r.payload.id));
  update({ newest });
  announce(viewRecords());
  if (n.pending) { stop(); toast('Escalated: a named human must approve or deny'); }
  else if (n.done) toast(`Outcome: ${STATUS_BIG[n.result.status] || n.result.status}`);
  return !n.done && !n.pending;
}

function stop() { S.playing = false; clearTimeout(S.timer); renderRunState(); }
function tickPlay() {
  if (!S.playing) return;
  const more = stepOnce();
  if (!more) { stop(); return; }
  S.timer = setTimeout(tickPlay, 1100 / SPEEDS[S.speed]);
}
function play() {
  const finished = isReplay() ? S.replay && S.replay.cursor >= S.replay.all.length : S.neg && S.neg.done;
  if (finished) { softReset(); }
  S.playing = true; renderRunState(); tickPlay();
}

function syncURL() {
  const u = new URL(location.href);
  for (const k of ['scenario', 'seed', 'style', 'ours', 'rounds', 'file']) u.searchParams.delete(k);
  u.searchParams.set('scenario', S.scnId);
  if (isReplay()) { if (S.replayWhich === 'aurora') u.searchParams.set('file', 'aurora'); }
  else { u.searchParams.set('seed', S.seed); u.searchParams.set('style', themStyle()); u.searchParams.set('ours', S.ours); u.searchParams.set('rounds', S.rounds); }
  history.replaceState(null, '', u);
  return u.toString();
}

function softReset() {
  if (isReplay()) { if (S.replay) S.replay.cursor = 0; update({ force: true }); return; }
  S.neg = new Negotiation(S.scnId, { seed: S.seed, style: themStyle(), ours: S.ours, rounds: S.rounds, policy: 'interactive' });
  update({ force: true });
}

async function reset() {
  stop();
  const replay = isReplay();
  $('#ctlSynth').hidden = replay; $('#ctlReplay').hidden = !replay;
  $('#textSource').textContent = replay ? 'recorded text · replayed read-only' : 'template-generated text, no LLM';
  renderScenarioList();
  syncURL();
  renderMCState();
  if (replay) {
    S.neg = null; S.A = null;
    renderFileSeg();
    if (!S.replay || S.replay.which !== (S.replayWhich || 'operator')) {
      S.replay = null; renderMandate(); update({ force: true });
      try { await loadReplay(S.replayWhich || 'operator'); } catch (e) { toast('Could not load the recording'); $('#feed').innerHTML = `<div class="feed-empty"><span>Could not load the recorded file (${esc(e.message)}).</span></div>`; return; }
    } else S.replay.cursor = 0;
    renderViewAs(); renderExportOptions(); update({ force: true });
    return;
  }
  S.replay = null;
  const opts = { seed: S.seed, style: themStyle(), ours: S.ours, rounds: S.rounds, policy: 'interactive' };
  S.neg = new Negotiation(S.scnId, opts);
  S.A = analyse(S.neg.inst);
  const t = new Negotiation(S.scnId, opts); t.step();
  S.ctxRecs = t.records.filter((r) => r.kind === 'header' || r.kind === 'context');
  plotStaticCache = plotStaticSynth();
  renderStyleSegs(); renderViewAs(); renderExportOptions();
  update({ force: true });
}

// ------------------------------------------------------------------ replay files
function renderFileSeg() {
  const opts = [['operator', 'Operator file'], ['aurora', 'Aurora view']];
  if (replayCache.custom) opts.push(['custom', 'Your file']);
  const seg = $('#segFile');
  seg.style.gridTemplateColumns = `repeat(${opts.length}, minmax(0, 1fr))`;
  seg.innerHTML = opts.map(([id, l]) => `<button type="button" data-file="${id}" aria-pressed="${(S.replayWhich || 'operator') === id}" ${tip(id === 'custom' ? esc(replayCache.customName || 'your file') : esc(REPLAY.files[id].label))}>${l}</button>`).join('');
}

async function loadReplay(which, keepTick = null) {
  let text = replayCache[which];
  if (text == null) {
    const res = await fetch(REPLAY.files[which].href, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = replayCache[which] = await res.text();
  }
  const parsed = parseNDJSON(text);
  const name = which === 'custom' ? replayCache.customName || 'your file' : REPLAY.files[which].href.split('/').pop();
  setReplay(parsed, which, name);
  if (keepTick != null) S.replay.cursor = S.replay.all.filter((r) => r.tick <= keepTick).length;
}

function setReplay(parsed, which, name) {
  const recs = parsed.records;
  const h = parsed.header;
  let parties = h && Array.isArray(h.payload.parties) ? h.payload.parties.filter((p) => p && typeof p.teamTwinName === 'string') : [];
  if (!parties.length) {
    const ids = [...new Set(recs.filter((r) => r.kind === 'move').map((r) => r.payload.partyTwin || r.actor).filter(Boolean))];
    parties = ids.map((id) => ({ teamTwinName: String(id), side: '' }));
  }
  const colors = Object.fromEntries(parties.map((p, i) => [p.teamTwinName, SEAT_COLORS[i % SEAT_COLORS.length]]));
  const mediators = parties.filter((p) => p.side === 'mediator').map((p) => p.teamTwinName);
  const moves = recs.filter((r) => r.kind === 'move');
  const raw = new Map(); const all = [];
  for (const r of moves) { const v = priceSignals(fixMojibake(r.payload.text || '')); raw.set(r.payload.id, v); all.push(...v); }
  const sorted = all.slice().sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const priceOf = new Map();
  for (const [id, vs] of raw) { const v = vs.find((x) => x >= med * 0.5 && x <= med * 1.5); if (v != null) priceOf.set(id, v); }
  const det = new Map(); const hist = [];
  if (!parsed.synthetic) for (const r of moves) {
    const m = { id: r.payload.id, partyTwin: r.payload.partyTwin || r.actor, channelId: r.channel, roundNumber: r.round, kind: r.payload.kind || 'message', text: fixMojibake(r.payload.text || '') };
    det.set(m.id, detectText(m.text, { id: m.id, party: m.partyTwin, channel: m.channelId, round: m.roundNumber, kind: m.kind, history: hist, mediators }));
    hist.push(m);
  }
  S.replayWhich = which;
  S.replay = { which, name, all: recs, cursor: 0, perspective: parsed.perspective, errors: parsed.errors, det, parties, colors, priceOf, maxRound: Math.max(1, ...recs.map((r) => r.round || 0)), synthetic: parsed.synthetic };
  S.viewer = parsed.perspective !== 'operator' ? parsed.perspective : (S.viewer && parties.some((p) => p.teamTwinName === S.viewer) ? S.viewer : 'operator');
}

async function switchFile(which) {
  if (!isReplay() || (S.replay && S.replay.which === which)) return;
  stop();
  const view = allRecords();
  const keep = view.length ? view[view.length - 1].tick : null;
  try { await loadReplay(which, keep); } catch (e) { toast('Could not load that file'); return; }
  renderFileSeg(); renderViewAs(); renderExportOptions(); syncURL();
  update({ force: true });
  toast(S.replay.perspective !== 'operator' ? `Perspective export: “View as” locked to ${nameOf(S.replay.perspective)}` : 'Operator file: every channel visible');
}

function onFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('File larger than 8 MB'); return; }
  const fr = new FileReader();
  fr.onerror = () => toast('Could not read that file');
  fr.onload = () => {
    const text = String(fr.result || '');
    const parsed = parseNDJSON(text);
    if (!parsed.records.length) {
      $('#fileNote').innerHTML = `<span style="color:var(--risk)">No valid v1 records found.</span> ${parsed.errors.slice(0, 3).map((e) => `line ${e.line}: ${esc(e.msg)}`).join(' · ')}`;
      toast('No valid diplomacy-table v1 records in that file');
      return;
    }
    replayCache.custom = text; replayCache.customName = file.name.slice(0, 80);
    stop();
    setReplay(parsed, 'custom', replayCache.customName);
    $('#fileNote').innerHTML = `Loaded <b>${esc(replayCache.customName)}</b>: ${parsed.records.length} records${parsed.errors.length ? `, ${parsed.errors.length} bad line(s) skipped` : ''}. Perspective: ${esc(parsed.perspective)}.`;
    renderFileSeg(); renderViewAs(); renderExportOptions(); syncURL();
    update({ force: true });
    toast(`Loaded ${replayCache.customName}`);
  };
  fr.readAsText(file);
}

// ------------------------------------------------------------------ Monte Carlo
function renderMCState() {
  const rep = isReplay();
  $('#btnMC').disabled = rep;
  $('#mcScn').textContent = rep ? 'Replay: trials need a synthetic table' : `${scn().code} · ${scn().title}`;
  if (!rep && S.mc && S.mc.scnId !== S.scnId) { S.mc = null; $('#mcOut').innerHTML = '<p class="muted small">Run the trials to see how often this mandate settles, escalates or walks.</p>'; }
  if (rep) $('#mcOut').innerHTML = '<p class="muted small">Monte Carlo runs on the synthetic tables A–D. A recording is one history and can’t be re-sampled.</p>';
}

function runMC() {
  if (isReplay()) return;
  const btn = $('#btnMC');
  btn.disabled = true; btn.textContent = 'Running…';
  $('#mcSeed').value = String(clampInt($('#mcSeed').value, 0, 999999, S.seed));
  setTimeout(() => {
    const seed = clampInt($('#mcSeed').value, 0, 999999, S.seed);
    const vary = $('#mcVary').value === 'seed' ? 'seed' : 'seed+style';
    const t0 = performance.now();
    const mc = monteCarlo(S.scnId, { seed, style: themStyle(), ours: S.ours, rounds: S.rounds, vary, trials: 20, policy: 'park' });
    S.mc = { ...mc, seed, vary, scnId: S.scnId, ms: performance.now() - t0 };
    renderMC();
    btn.disabled = false; btn.textContent = 'Run 20 trials';
  }, 20);
}

function renderMC() {
  const m = S.mc; if (!m) return;
  const c = m.counts, T = m.rows.length;
  const parts = [[c.settled, 'settled'], [c.approved, 'approved by a human'], [c.escalated, 'escalated to a human'], [c.walked, 'walked away']].filter(([n], i) => n || i === 0);
  const sentence = parts.map(([n, l], i) => `<span class="k">${n}</span>${i === 0 ? ` of ${T}` : ''} ${l}`).join('<span class="sep">·</span>');
  // dot strip of joint utility (settled) + a "no deal" lane
  const W = 640, H = 170, L = 20, Rr = 20, base = 112;
  const deals = m.rows.filter((r) => r.joint != null), none = m.rows.filter((r) => r.joint == null);
  const lo = 0.6, hi = 2;
  const xj = (j) => L + 90 + ((Math.max(lo, Math.min(hi, j)) - lo) / (hi - lo)) * (W - L - Rr - 90);
  const bins = new Map();
  const dots = deals.map((r) => {
    const b = Math.round(xj(r.joint) / 13); const k = bins.get(b) || 0; bins.set(b, k + 1);
    return `<circle class="mc-dot ${r.outcome}" cx="${r1(xj(r.joint))}" cy="${base - 8 - k * 13}" r="5.5"><title>trial ${r.i + 1} · seed ${r.seed} · ${r.style} · ${r.outcome} · joint ${f2(r.joint)} · ${r.rounds} rounds</title></circle>`;
  }).join('');
  const noneDots = none.map((r, i) => `<circle class="mc-dot ${r.outcome}" cx="${L + 8 + (i % 6) * 13}" cy="${base - 8 - Math.floor(i / 6) * 13}" r="5.5"><title>trial ${r.i + 1} · seed ${r.seed} · ${r.style} · ${r.outcome} · no deal</title></circle>`).join('');
  const ticks = [0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2].map((v) => `<line class="ax" x1="${r1(xj(v))}" x2="${r1(xj(v))}" y1="${base}" y2="${base + 4}"/><text class="tl" x="${r1(xj(v))}" y="${base + 17}" text-anchor="middle">${v.toFixed(1)}</text>`).join('');
  const med = m.medianJoint != null ? `<line x1="${r1(xj(m.medianJoint))}" x2="${r1(xj(m.medianJoint))}" y1="20" y2="${base}" style="stroke:var(--fg);stroke-dasharray:3 3;opacity:.6"/><text class="tl" x="${r1(xj(m.medianJoint)) + 4}" y="28">median ${f2(m.medianJoint)}</text>` : '';
  const strip = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dot strip of joint utility per trial; no-deal trials on the left">
    <line class="ax" x1="${L + 90}" x2="${W - Rr}" y1="${base}" y2="${base}"/>${ticks}${med}${dots}
    <line class="ax" x1="${L}" x2="${L + 76}" y1="${base}" y2="${base}"/><text class="tl" x="${L + 38}" y="${base + 17}" text-anchor="middle">no deal</text>${noneDots}
    <text class="tl" x="${(L + 90 + W - Rr) / 2}" y="${H - 6}" text-anchor="middle">joint utility (ours + theirs, each 0–1) →</text></svg>`;
  const R = S.rounds, hist = Array.from({ length: R + 1 }, () => 0);
  for (const r of m.rows) hist[Math.min(R, r.rounds)]++;
  const HW = 360, HH = 170, hb = 130, bw = (HW - 40) / R;
  const hmax = Math.max(1, ...hist);
  const bars = hist.slice(1).map((n, i) => `<rect class="mc-bar" x="${r1(30 + i * bw + 3)}" y="${r1(hb - (n / hmax) * 100)}" width="${r1(bw - 6)}" height="${r1((n / hmax) * 100)}" rx="3"><title>${n} trial(s) ended in round ${i + 1}</title></rect><text class="tl" x="${r1(30 + i * bw + bw / 2)}" y="${hb + 14}" text-anchor="middle">${i + 1}</text>${n ? `<text class="tl" x="${r1(30 + i * bw + bw / 2)}" y="${r1(hb - (n / hmax) * 100 - 5)}" text-anchor="middle" style="fill:var(--fg)">${n}</text>` : ''}`).join('');
  const histSVG = `<svg viewBox="0 0 ${HW} ${HH}" role="img" aria-label="Histogram of rounds used"><line class="ax" x1="30" x2="${HW - 10}" y1="${hb}" y2="${hb}"/>${bars}<text class="tl" x="${HW / 2}" y="${HH - 6}" text-anchor="middle">rounds used →</text></svg>`;
  const prohib = m.rows.reduce((a, r) => a + (r.prohibited || 0), 0);
  const prohibOurs = m.rows.reduce((a, r) => a + (r.prohibitedOurs || 0), 0);
  const rows = m.rows.map((r) => `<tr><td>${r.i + 1}</td><td class="mono">${r.seed}</td><td>${esc(STYLE_SHORT[r.style] || r.style)}</td><td class="o-${r.outcome}">${r.outcome}</td><td>${r.rounds}</td><td>${f2(r.uUs)}</td><td>${f2(r.uThem)}</td><td>${f2(r.joint)}</td><td>${f3(r.distNash)}</td><td><button type="button" class="btn sm" data-trial="${r.i}">Open</button></td></tr>`).join('');
  $('#mcOut').innerHTML = `
    <p class="mc-counts">${sentence}</p>
    <p class="small muted">${esc(scn().title)} · base seed ${m.seed} · varying ${m.vary === 'seed' ? `seed only (counterpart ${STYLE_SHORT[themStyle()]})` : 'seed and counterpart style'} · our style ${STYLE_SHORT[S.ours]} · ${S.rounds} rounds · ${Math.round(m.ms)} ms in your browser. The same base seed always gives the same twenty.</p>
    <div class="mc-grid">
      <div class="panel"><div class="panel-head"><h4>Joint utility per trial</h4><span class="spacer"></span><span class="tiny muted">● settled ● escalated ● walked</span></div><div class="panel-body">${strip}</div></div>
      <div class="panel"><div class="panel-head"><h4>Rounds used</h4></div><div class="panel-body">${histSVG}</div></div>
    </div>
    <div class="mc-stats">
      <div class="stat"><b>${m.medianDistNash == null ? '–' : f3(m.medianDistNash)}</b><span>median distance to Nash (deals)</span></div>
      <div class="stat"><b>${m.medianRounds ?? '–'}</b><span>median rounds</span></div>
      <div class="stat"><b>${m.escalationEvents}</b><span>escalation events (auto-parked)</span></div>
      <div class="stat"><b>${prohib}</b><span>prohibited moves flagged to the Auditor (by our agent: ${prohibOurs})</span></div>
    </div>
    <details class="mc-details"><summary>All 20 trials (open any one in the room)</summary>
      <div class="table-wrap mc-table"><table class="t"><thead><tr><th>#</th><th>seed</th><th>counterpart</th><th>outcome</th><th>rounds</th><th>U us</th><th>U them</th><th>joint</th><th>Δ Nash</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </details>`;
  $('#mcOut').querySelector('.panel-head .tiny').innerHTML = '<span style="color:var(--ok)">●</span> settled <span style="color:var(--warn)">●</span> escalated <span style="color:var(--risk)">●</span> walked';
}

// ------------------------------------------------------------------ export
function exportOptionList() {
  const lock = lockedPerspective();
  if (lock) return [{ id: lock, label: `${nameOf(lock)} (file perspective)` }];
  if (isReplay()) return S.replay ? perspectiveOptions(S.replay.all) : [];
  const lbl = { us: 'Us', them: 'Supplier', broker: 'Broker' };
  return [{ id: 'operator', label: 'Operator (everything)' }, ...scn().seats.map((s) => ({ id: s.id, label: `${lbl[s.key]} · ${s.name}` }))];
}
function renderExportOptions() {
  const sel = $('#exAs');
  const opts = exportOptionList();
  const prev = sel.value;
  sel.innerHTML = opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
  sel.value = opts.some((o) => o.id === prev) ? prev : opts.length ? opts[0].id : '';
}
function exportRecords() {
  const persp = $('#exAs').value || 'operator';
  const all = isReplay() ? (S.replay ? S.replay.all : []) : S.neg ? S.neg.records : [];
  return { persp, recs: lockedPerspective() ? all : exportPerspective(all, persp) };
}
function renderExport() {
  const { recs, persp } = exportRecords();
  const pre = $('#exPreview');
  $('#btnExport').disabled = !recs.length;
  if (!recs.length) { pre.textContent = 'Nothing to export yet. Press Play or Step in the room first.'; $('#exMeta').textContent = '–'; return; }
  const lines = toNDJSON(recs).trimEnd().split('\n');
  const head = lines.slice(0, 14).map((l) => esc(l.length > 200 ? `${l.slice(0, 200)}…` : l).replace(/&quot;kind&quot;:&quot;([a-z_]+)&quot;/, '&quot;kind&quot;:&quot;<span class="k">$1</span>&quot;')).join('\n');
  pre.innerHTML = `${head}${lines.length > 14 ? `\n<span class="k">… ${lines.length - 14} more records</span>` : ''}`;
  const h = recs.find((r) => r.kind === 'header');
  const gaps = tickGaps(recs).length;
  const running = !isReplay() && S.neg && !S.neg.done;
  $('#exMeta').textContent = `${recs.length} records · ${h && h.payload.withheldEntries ? `${h.payload.withheldEntries} withheld · ` : ''}${gaps} tick gap${gaps === 1 ? '' : 's'}${running ? ' · run in progress' : ''} · as ${persp}`;
}
function download() {
  const { recs, persp } = exportRecords();
  if (!recs.length) return;
  const text = toNDJSON(recs);
  const safe = (s) => String(s).replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60);
  const name = isReplay() ? `replay-${safe(S.replay.name.replace(/\.ndjson$/i, ''))}-${safe(persp)}.ndjson` : `nso-nego-${S.scnId}-seed${S.seed}-${safe(persp)}.ndjson`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Downloaded ${name}`);
}

// ------------------------------------------------------------------ method: rules table
const RULE_WHEN = {
  R1: 'First package sits far from the other side’s position, or most issues at the end of their range; text: first priced proposal.',
  R2: 'Moves ≥0.12 (normalised) toward the other side’s last package in one step; text: price moves ≥4%.',
  R3: 'Concedes right after the other side conceded: matched movement.',
  R4: 'Moves toward them on some issues while firming on others; or “in exchange for / if you can”.',
  R5: '“Valid until”, “by the end of”, “within N days”, “deadline”.',
  R6: 'Mentions an alternative: other buyers, a second source, a walk-away point.',
  R7: 'Made in a channel that excludes a seat (caucus); or coalition language.',
  R8: 'Asks the other side for information.',
  R9: '“Final offer”, “take it or leave it”, walk-away threats.',
  R10: 'Claimed an offer expired at round N, then kept negotiating after N. Flagged to the Auditor.',
  R11: 'Cites another supplier’s price or terms. Envoy quarantines it (information barrier).',
  R12: 'Repeats the identical package, or restates without new figures.',
};
function renderRules() {
  $('#rulesTable tbody').innerHTML = [...RULES.map((r) => `<tr class="${r.prohibited ? 'prohibited' : ''}"><td>${r.rule}</td><td>${esc(r.tag)}${r.prohibited ? ' <span class="badge risk">prohibited</span>' : ''}</td><td>${esc(RULE_WHEN[r.rule] || r.label)}</td></tr>`),
    '<tr><td style="color:var(--muted)">R0</td><td>positional-statement</td><td>Nothing fired. An honest low-confidence (0.30) placeholder, not evidence of a tactic.</td></tr>'].join('');
}

// ------------------------------------------------------------------ wiring
function wire() {
  $('#scnList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scn]'); if (!b || b.dataset.scn === S.scnId) return;
    S.scnId = b.dataset.scn; S.viewer = 'operator'; S.tab = 'all'; S.mode = isReplay() ? 'replay' : 'synth';
    if (!isReplay()) S.style = null;
    reset();
  });
  $('#segThem').addEventListener('click', (e) => { const b = e.target.closest('[data-them]'); if (!b) return; S.style = b.dataset.them; reset(); });
  $('#segUs').addEventListener('click', (e) => { const b = e.target.closest('[data-us]'); if (!b) return; S.ours = b.dataset.us; reset(); });
  $('#segFile').addEventListener('click', (e) => { const b = e.target.closest('[data-file]'); if (b) switchFile(b.dataset.file); });
  $('#seed').addEventListener('change', (e) => { S.seed = clampInt(e.target.value, 0, 999999, 42); e.target.value = String(S.seed); reset(); });
  $('#btnShuffle').addEventListener('click', () => { S.seed = Math.floor(Math.random() * 100000); reset(); });
  $('#rounds').addEventListener('change', (e) => { S.rounds = clampInt(e.target.value, 3, 12, 6); reset(); });
  $('#speed').addEventListener('input', (e) => { S.speed = clampInt(e.target.value, 0, 4, 2); $('#speedOut').textContent = `${SPEEDS[S.speed]}×`; });
  $('#btnPlay').addEventListener('click', () => (S.playing ? stop() : play()));
  $('#btnStep').addEventListener('click', () => { stop(); stepOnce(); });
  $('#btnReset').addEventListener('click', () => { stop(); softReset(); });
  $('#btnLink').addEventListener('click', async () => {
    const url = syncURL();
    try { await navigator.clipboard.writeText(url); toast('Link copied: it reproduces this run'); } catch { toast('Link is in the address bar'); }
  });
  $('#viewAs').addEventListener('change', (e) => { if (lockedPerspective()) return; S.viewer = e.target.value; update({ force: true }); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.dataset.tab; update({ force: true }); $(`#tab-${S.tab}`)?.focus(); });
  $('#tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const ids = ['all', 'plenary', 'caucus', 'brief']; let i = ids.indexOf(S.tab);
    i = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    S.tab = ids[i]; update({ force: true }); $(`#tab-${S.tab}`)?.focus(); e.preventDefault();
  });
  $('#feed').addEventListener('click', (e) => {
    const b = e.target.closest('[data-decide]'); if (!b || !S.neg || !S.neg.pending) return;
    S.neg.decide(b.dataset.decide === 'approve' ? 'approve' : 'deny');
    update(); announce(viewRecords());
    toast(b.dataset.decide === 'approve' ? 'Approved by the named human (simulated)' : 'Denied: the agent stays inside its mandate');
    if (!S.neg.done) { S.playing = true; S.timer = setTimeout(tickPlay, 600); renderRunState(); }
  });
  $('#fileInput').addEventListener('change', (e) => { onFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  $('#btnMC').addEventListener('click', runMC);
  $('#mcOut').addEventListener('click', (e) => {
    const b = e.target.closest('[data-trial]'); if (!b || !S.mc) return;
    const r = S.mc.rows[+b.dataset.trial]; if (!r) return;
    S.seed = r.seed; S.style = r.style; reset();
    document.getElementById('room').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    toast(`Trial ${r.i + 1} loaded: seed ${r.seed}, ${STYLE_SHORT[r.style]}`);
  });
  $('#exAs').addEventListener('change', renderExport);
  $('#btnExport').addEventListener('click', download);
}

// ------------------------------------------------------------------ init
readParams();
S.mode = isReplay() ? 'replay' : 'synth';
$('#speed').value = String(S.speed); $('#speedOut').textContent = `${SPEEDS[S.speed]}×`;
$('#mcSeed').value = String(S.seed);
renderRules();
renderStyleSegs();
wire();
reset();
observeReveals();
