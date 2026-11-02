// NDJSON helpers for diplomacy-table v1 records — pure, no DOM.
// Parse defensively (never eval), export, perspective redaction (ticks never renumbered),
// gap detection, display-name repair, ZOPA-readiness from records.

export const LIMITS = { maxBytes: 8 * 1024 * 1024, maxLines: 50000 };
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

export function toNDJSON(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

function validate(o) {
  if (!isObj(o)) return 'record is not an object';
  if (o.v !== 1) return `unsupported record version v=${JSON.stringify(o.v)}`;
  if (!Number.isFinite(o.tick)) return 'missing numeric tick';
  if (typeof o.kind !== 'string' || !o.kind || o.kind.length > 48) return 'missing kind';
  if (o.payload != null && !isObj(o.payload)) return 'payload is not an object';
  return null;
}

/** Parse NDJSON text into validated v1 records. Bad lines are reported, not thrown. */
export function parseNDJSON(text, { maxBytes = LIMITS.maxBytes, maxLines = LIMITS.maxLines } = {}) {
  const records = [], errors = [];
  if (typeof text !== 'string') return { records, errors: [{ line: 0, msg: 'input is not text' }], header: null, perspective: 'operator' };
  if (text.length > maxBytes) return { records, errors: [{ line: 0, msg: `file larger than ${Math.round(maxBytes / 1048576)} MB` }], header: null, perspective: 'operator' };
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n].trim();
    if (!raw) continue;
    if (records.length >= maxLines) { errors.push({ line: n + 1, msg: `stopped after ${maxLines} records` }); break; }
    let o;
    try { o = JSON.parse(raw); } catch { errors.push({ line: n + 1, msg: 'invalid JSON' }); continue; }
    const bad = validate(o);
    if (bad) { errors.push({ line: n + 1, msg: bad }); continue; }
    records.push({
      v: 1, tick: Math.trunc(o.tick), round: Number.isFinite(o.round) ? Math.trunc(o.round) : 0, ts: typeof o.ts === 'string' ? o.ts : '',
      kind: o.kind, actor: typeof o.actor === 'string' ? o.actor : '', channel: typeof o.channel === 'string' && o.channel ? o.channel : 'plenary',
      payload: isObj(o.payload) ? o.payload : {},
    });
  }
  const header = records.find((r) => r.kind === 'header') || null;
  const perspective = (header && typeof header.payload.perspective === 'string' && header.payload.perspective) || 'operator';
  return { records, errors, header, perspective, synthetic: !!(header && header.payload.synthetic) };
}

// ---------------------------------------------------------------- display helpers

const MOJIBAKE = [
  ['â€”', '—'], ['â€“', '–'], ['â€™', '’'], ['â€˜', '‘'], ['â€œ', '“'], ['â€\u009d', '”'], ['â€¦', '…'], ['â€¢', '•'], ['Ã©', 'é'], ['Â ', ' '], ['Â·', '·'],
];
/** Repair common UTF-8-read-as-cp1252 sequences ("â€”" → "—"). */
export function fixMojibake(s) {
  let t = String(s ?? '');
  if (!/[âÃÂ]/.test(t)) return t;
  for (const [a, b] of MOJIBAKE) t = t.split(a).join(b);
  return t;
}

/** True for display names that are obviously broken templates (e.g. " charlie.Value.ToUpper() harlie"). */
export function isBrokenName(s) {
  if (typeof s !== 'string') return true;
  const t = s.trim();
  if (!t || t.length > 80) return true;
  return /[{}$<>`]|\.Value\b|To(?:Upper|Lower)|\(\)|\bundefined\b|\bnull\b|^[^A-Za-z0-9]/.test(t) || s !== t;
}

export function titleFromTwin(id) {
  const last = String(id || '').split(/[-_:]/).filter(Boolean).pop() || String(id || '?');
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function displayNameFor(party) {
  if (!party) return '?';
  return isBrokenName(party.displayName) ? titleFromTwin(party.teamTwinName) : fixMojibake(party.displayName);
}

// ---------------------------------------------------------------- perspective redaction

/** Channel membership: declared in header.channels, else inferred from move authorship (operator records only). */
export function channelMembership(records) {
  const header = records.find((r) => r.kind === 'header');
  const map = new Map();
  const declared = header && Array.isArray(header.payload.channels) ? header.payload.channels : [];
  for (const c of declared) if (isObj(c) && typeof c.id === 'string') map.set(c.id, { members: new Set(Array.isArray(c.members) ? c.members : []), inferred: false, label: c.label });
  for (const r of records) {
    if (r.kind !== 'move' || r.channel === 'plenary' || r.channel.startsWith('brief-')) continue;
    if (!map.has(r.channel)) map.set(r.channel, { members: new Set(), inferred: true });
    const c = map.get(r.channel);
    if (c.inferred) c.members.add(r.payload.partyTwin || r.actor);
  }
  return map;
}

/** Allow-list visibility: plenary for everyone, own brief, and channels the viewer is a member of. */
export function canSee(viewer, channel, membership) {
  if (!viewer || viewer === 'operator') return true;
  if (!channel || channel === 'plenary') return true;
  if (channel === `brief-${viewer}`) return true;
  const c = membership.get(channel);
  return !!c && c.members.has(viewer);
}

const countBy = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Perspective export. 'operator' returns everything. A seat view drops records on channels the seat cannot see
 * and tactic records whose evidence was dropped; scrubs other parties' briefs, private scores and debriefs.
 * Tick numbers are never renumbered, so gaps reveal redactions.
 */
export function exportPerspective(records, viewer = 'operator') {
  if (!viewer || viewer === 'operator') return records.map(clone);
  const membership = channelMembership(records);
  const dropped = new Set();
  const redactions = new Set();
  let withheld = 0;
  const pass1 = [];
  for (const r of records) {
    if (canSee(viewer, r.channel, membership)) { pass1.push(r); continue; }
    withheld++;
    if (r.kind === 'move' && r.payload.id) dropped.add(r.payload.id);
    redactions.add(r.channel.startsWith('brief-') ? 'private-brief' : r.channel.startsWith('caucus') ? 'caucus' : 'channel');
  }
  const kept = [];
  for (const r of pass1) {
    const ev = Array.isArray(r.payload.evidenceMoveIds) ? r.payload.evidenceMoveIds : [];
    const ref = r.payload.moveRef || r.payload.moveId;
    if (ev.some((id) => dropped.has(id)) || (ref && dropped.has(ref))) { withheld++; continue; }
    kept.push(clone(r));
  }
  const visibleMoves = kept.filter((r) => r.kind === 'move');
  const visibleTactics = kept.filter((r) => r.kind === 'tactic');
  const lastTs = records.length ? records[records.length - 1].ts : '';
  const scrubScores = (scores) => (Array.isArray(scores) ? scores.map((s) => (s && s.teamTwinName === viewer ? s : { teamTwinName: s && s.teamTwinName, agreementsWon: s && s.agreementsWon, withheld: true })) : scores);
  for (const r of kept) {
    const p = r.payload;
    if (r.kind === 'context' && Array.isArray(p.parties)) {
      p.parties = p.parties.map((q) => (q.teamTwinName === viewer ? q : { teamTwinName: q.teamTwinName, displayName: q.displayName, side: q.side, participant: q.participant, withheld: true }));
      redactions.add('context');
    } else if (r.kind === 'round_end' && Array.isArray(p.scores) && p.scores.some((s) => s && s.satisfaction != null && s.teamTwinName !== viewer)) {
      if (records.find((x) => x.kind === 'header')?.payload.synthetic) { p.scores = scrubScores(p.scores); redactions.add('scores'); }
    } else if (r.kind === 'round_summary') {
      const rn = p.roundNumber;
      const mv = visibleMoves.filter((m) => m.payload.roundNumber === rn).map((m) => m.payload);
      const tc = visibleTactics.filter((t) => t.payload.roundNumber === rn).map((t) => t.payload);
      const vis = new Set(mv.map((m) => String(m.text || '').slice(0, 60)));
      r.payload = {
        ...p, movesByParty: countBy(mv, (m) => m.partyTwin), movesByKind: countBy(mv, (m) => m.kind),
        tacticsObserved: countBy(tc, (t) => t.tacticId),
        highlights: (p.highlights || []).filter((h) => vis.has(String(h.excerpt || '').slice(0, 60))),
      };
      if (p.movesByChannel) r.payload.movesByChannel = countBy(mv, (m) => m.channelId);
      redactions.add('round_summary');
    } else if (r.kind === 'outcome') {
      delete p.operatorAnalysis;
      if (Array.isArray(p.debriefs)) p.debriefs = p.debriefs.filter((d) => d.teamTwinName === viewer);
      if (records.find((x) => x.kind === 'header')?.payload.synthetic) p.scoreboard = scrubScores(p.scoreboard);
      if (Array.isArray(p.prohibitedTactics)) p.prohibitedTactics = visibleTactics.filter((t) => t.payload.prohibited).map((t) => ({ ruleId: t.payload.ruleId, tag: t.payload.tacticId, partyTwin: t.payload.partyTwin, roundNumber: t.payload.roundNumber }));
      p.scrubbedFor = viewer;
      redactions.add('outcome');
    }
  }
  const h = kept.find((r) => r.kind === 'header');
  if (h) {
    const p = h.payload;
    p.perspective = viewer;
    p.redactions = [...redactions].sort();
    p.withheldEntries = withheld;
    p.sensitivity = `DELEGATION VIEW (${viewer}) — filtered to this party's visibility.`;
    p.exportedAt = lastTs;
    if (Array.isArray(p.channels)) p.channels = p.channels.filter((c) => canSee(viewer, c.id, membership));
  }
  return kept;
}

/** Missing tick ranges between the first and last tick (ticks are never renumbered, so gaps = withheld). */
export function tickGaps(records) {
  const t = [...new Set(records.map((r) => r.tick))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 1) gaps.push({ from: t[i - 1] + 1, to: t[i] - 1, count: t[i] - t[i - 1] - 1, after: t[i - 1] });
  return gaps;
}

/** Seats that can be chosen in "View as" (operator + every party in the header). */
export function perspectiveOptions(records) {
  const h = records.find((r) => r.kind === 'header');
  const parties = h && Array.isArray(h.payload.parties) ? h.payload.parties : [];
  return [{ id: 'operator', label: 'Operator (everything)' }, ...parties.map((p) => ({ id: p.teamTwinName, label: displayNameFor(p), side: p.side }))];
}

// ---------------------------------------------------------------- ZOPA readiness from records

/**
 * Five authored inputs are needed before a ZOPA can be computed: both reservation values, both BATNAs priced,
 * and issue weights. Priority labels are not weights; prose red lines are not priced reservations. Never inferred.
 */
export function readinessFromRecords(records) {
  const ctx = records.find((r) => r.kind === 'context');
  const h = records.find((r) => r.kind === 'header');
  const hp = h ? h.payload.parties || [] : [];
  const cparties = ctx && Array.isArray(ctx.payload.parties) ? ctx.payload.parties : [];
  const principals = (hp.length ? hp : cparties).filter((p) => p.side !== 'mediator').slice(0, 2).map((p) => p.teamTwinName);
  const byId = Object.fromEntries(cparties.map((p) => [p.teamTwinName, p]));
  const name = (id) => displayNameFor(hp.find((p) => p.teamTwinName === id) || byId[id] || { teamTwinName: id });
  const inputs = [];
  for (const id of principals) {
    const p = byId[id];
    const res = p && Number.isFinite(p.reservationUtility);
    inputs.push({
      id: `res:${id}`, label: `${name(id)} reservation value`, ok: !!res,
      note: !p ? 'no brief in this record' : p.withheld ? 'withheld from this view' : res ? `utility ${p.reservationUtility}` : (Array.isArray(p.redLines) && p.redLines.length ? 'red lines in prose only — not a priced reservation' : 'not authored'),
    });
  }
  for (const id of principals) {
    const p = byId[id];
    const v = p && p.batna && Number.isFinite(p.batna.estimatedValue);
    inputs.push({
      id: `batna:${id}`, label: `${name(id)} BATNA priced`, ok: !!v,
      note: !p ? 'no brief in this record' : p.withheld ? 'withheld from this view' : v ? `$${Math.round(p.batna.estimatedValue).toLocaleString('en-US')}` : 'BATNA not priced',
    });
  }
  const weighted = principals.length === 2 && principals.every((id) => byId[id] && isObj(byId[id].weights) && Object.values(byId[id].weights).every(Number.isFinite));
  const anyPriority = cparties.some((p) => Array.isArray(p.goals) && p.goals.some((g) => g.priority));
  inputs.push({
    id: 'weights', label: 'Issue weights (both principals)', ok: weighted,
    note: weighted ? 'authored, sum to 1' : principals.some((id) => byId[id] && byId[id].withheld) ? 'counterpart weights withheld from this view' : anyPriority ? 'priority labels only — a priority is not a weight' : 'not authored',
  });
  return { principals, inputs, ready: inputs.length === 5 && inputs.every((i) => i.ok) };
}

/** Light summary for UI headers. */
export function summarise(records) {
  const ticks = records.map((r) => r.tick);
  return {
    count: records.length,
    kinds: countBy(records, (r) => r.kind),
    channels: countBy(records, (r) => r.channel),
    rounds: Math.max(0, ...records.map((r) => r.round || 0)),
    firstTick: ticks.length ? Math.min(...ticks) : null,
    lastTick: ticks.length ? Math.max(...ticks) : null,
    gaps: tickGaps(records),
  };
}
