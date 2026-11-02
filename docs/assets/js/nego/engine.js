// Negotiation engine — pure, deterministic, no DOM. Imports cleanly in Node.
// Models: additive multi-issue utility over discrete issue levels; time-dependent
// concession (Faratin, Sierra & Jennings 1998); log-rolling offer generation with a
// frequency opponent model; acceptance condition AC_next; mandate gate + escalation.
import { Rng, hashSeed } from '../lib/rng.js';
import { SCENARIOS, levelValues, fmtInt } from './scenarios.js';
import { detectMove } from './detector.js';

export const GENERATOR = 'neocloud-supply-os/nego-engine';
export const GENERATOR_VERSION = '1.0.0';
export const EPOCH_MS = Date.UTC(2026, 0, 12, 9, 0, 0);
export const TICK_MS = 2500;

export const STYLES = {
  boulware: { id: 'boulware', label: 'Boulware', e: 0.2, blurb: 'holds firm, concedes late (e≈0.2)' },
  linear: { id: 'linear', label: 'Linear', e: 1, blurb: 'steady concession (e=1)' },
  conceder: { id: 'conceder', label: 'Conceder', e: 3, blurb: 'concedes early (e≈3)' },
  tft: { id: 'tft', label: 'Tit-for-tat', e: null, blurb: 'mirrors the other side’s last concession, measured in its own utility; linear floor in the last quarter' },
};
export const STYLE_ORDER = ['boulware', 'linear', 'conceder', 'tft'];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r4 = (x) => Math.round(x * 1e4) / 1e4;
export const tsFor = (tick) => new Date(EPOCH_MS + tick * TICK_MS).toISOString();

// ---------------------------------------------------------------- instance

const SPACE_CACHE = new WeakMap();

/** Build a concrete negotiation instance: issue tables, jittered counterpart brief, enumerated outcome space. */
export function instantiate(scnOrId, opts = {}) {
  const scn = typeof scnOrId === 'string' ? SCENARIOS[scnOrId] : scnOrId;
  if (!scn || !scn.issues) throw new Error(`Unknown scenario: ${scnOrId}`);
  const seed = (Number.isFinite(+opts.seed) ? +opts.seed : 42) >>> 0;
  const style = STYLES[opts.style] ? opts.style : scn.defaultStyle;
  const ours = STYLES[opts.ours] ? opts.ours : 'linear';
  const rounds = clamp(Math.round(+opts.rounds || scn.defaultRounds), 2, 12);
  const rng = new Rng(hashSeed(`${scn.id}|${seed}|brief`));
  const j = scn.jitter || { weight: 0, reservation: 0 };

  const issues = scn.issues.map((is) => {
    const n = is.levels.length;
    return { ...is, n, val: { us: levelValues(is.us, n), them: levelValues(is.them, n) } };
  });
  const wUs = issues.map((is) => scn.weights.us[is.id]);
  const rawThem = issues.map((is) => scn.weights.them[is.id] * (1 + rng.float(-j.weight, j.weight)));
  const sumThem = rawThem.reduce((a, b) => a + b, 0);
  const sumUs = wUs.reduce((a, b) => a + b, 0);
  const w = { us: wUs.map((x) => x / sumUs), them: rawThem.map((x) => x / sumThem) };

  const toDigits = (terms) => issues.map((is) => {
    const d = is.levels.indexOf(terms[is.id]);
    if (d < 0) throw new Error(`BATNA term ${is.id}=${terms[is.id]} is not a level`);
    return d;
  });
  const inst = { scn, seed, style, ours, rounds, issues, w, k: issues.length };
  const batnaUs = toDigits(scn.batna.us.terms);
  const batnaThem = toDigits(scn.batna.them.terms);
  inst.res = {
    us: r4(utilityOf(inst, 'us', batnaUs)),
    them: r4(clamp(utilityOf(inst, 'them', batnaThem) + rng.float(-j.reservation, j.reservation), 0.05, 0.95)),
  };
  inst.batnaDigits = { us: batnaUs, them: batnaThem };

  // Enumerate the full outcome space (mixed radix). Our side (weights, mandate) is fixed per scenario → cached.
  let sp = SPACE_CACHE.get(scn);
  if (!sp) {
    const sizes = issues.map((is) => is.n);
    const N = sizes.reduce((a, b) => a * b, 1);
    const k = issues.length;
    const digits = new Uint8Array(N * k), uUs = new Float64Array(N), ok = new Uint8Array(N);
    const cur = new Array(k).fill(0);
    for (let i = 0; i < N; i++) {
      let a = 0;
      for (let q = 0; q < k; q++) { digits[i * k + q] = cur[q]; a += w.us[q] * issues[q].val.us[cur[q]]; }
      uUs[i] = a;
      ok[i] = mandateCheck(inst, cur).ok ? 1 : 0;
      for (let q = k - 1; q >= 0; q--) { if (++cur[q] < sizes[q]) break; cur[q] = 0; }
    }
    sp = { sizes, N, digits, uUs, ok };
    SPACE_CACHE.set(scn, sp);
  }
  const { sizes, N, digits, uUs, ok } = sp;
  const k = issues.length;
  const uThem = new Float64Array(N);
  const vt = issues.map((is, q) => is.val.them.map((v) => v * w.them[q]));
  for (let i = 0; i < N; i++) { let b = 0; for (let q = 0; q < k; q++) b += vt[q][digits[i * k + q]]; uThem[i] = b; }
  Object.assign(inst, { N, sizes, digits, uUs, uThem, ok });
  return inst;
}

export const digitsAt = (inst, i) => Array.from(inst.digits.subarray(i * inst.k, (i + 1) * inst.k));
export function indexOfDigits(inst, d) {
  let i = 0;
  for (let q = 0; q < inst.k; q++) i = i * inst.sizes[q] + d[q];
  return i;
}

/** Additive utility of a package (digit vector) for 'us' | 'them'. Always in [0,1]. */
export function utilityOf(inst, side, d) {
  let u = 0;
  for (let q = 0; q < inst.issues.length; q++) u += inst.w[side][q] * inst.issues[q].val[side][d[q]];
  return clamp(u, 0, 1);
}

export const offerValues = (inst, d) => Object.fromEntries(inst.issues.map((is, q) => [is.id, is.levels[d[q]]]));
export function digitsFromOffer(inst, offer) {
  if (!offer) return null;
  const d = inst.issues.map((is) => is.levels.indexOf(offer[is.id]));
  return d.some((x) => x < 0) ? null : d;
}
export const fmtOffer = (inst, d) => inst.issues.map((is, q) => `${is.short} ${is.fmt(is.levels[d[q]])}`).join(' · ');

// ---------------------------------------------------------------- mandate gate

/** Check a package against our signed mandate. Returns per-rule results; deterministic (FR-POL-003). */
export function mandateCheck(inst, d) {
  const rules = inst.scn.mandate.rules;
  const val = (id) => { const q = inst.issues.findIndex((is) => is.id === id); return inst.issues[q].levels[d[q]]; };
  const checks = rules.map((r) => {
    let pass = true, actual;
    if (r.op === 'max') { actual = val(r.issue); pass = actual <= r.value; }
    else if (r.op === 'min') { actual = val(r.issue); pass = actual >= r.value; }
    else if (r.op === 'in') { actual = val(r.issue); pass = r.value.includes(actual); }
    else if (r.op === 'product-max') { actual = r.issues.map(val).reduce((a, b) => a * b, 1); pass = actual <= r.value; }
    return { id: r.id, label: r.label, ok: pass, actual };
  });
  return { ok: checks.every((c) => c.ok), checks, failed: checks.filter((c) => !c.ok) };
}

// ---------------------------------------------------------------- analysis

/** Non-dominated subset of {x,y} points (maximising both), sorted by x ascending. */
export function paretoFrontier(points) {
  const s = points.slice().sort((a, b) => (b.x - a.x) || (b.y - a.y));
  const out = [];
  let best = -Infinity;
  for (const p of s) if (p.y > best) { out.push(p); best = p.y; }
  return out.reverse();
}

/** Nash bargaining point: maximises (x−dx)(y−dy) over points that improve on both disagreement values. */
export function nashPoint(points, dx, dy) {
  let best = null, bp = -Infinity;
  for (const p of points) {
    if (p.x <= dx || p.y <= dy) continue;
    const g = (p.x - dx) * (p.y - dy);
    if (g > bp) { bp = g; best = p; }
  }
  return best ? { ...best, product: bp } : null;
}

/** Fast single pass over the outcome space: Nash point (full and in-mandate), ZOPA counts, settleability. */
export function quickStats(inst) {
  const { uUs, uThem, ok, N } = inst, dx = inst.res.us, dy = inst.res.them;
  let zopa = 0, zopaOk = 0, bi = -1, bp = -Infinity, bo = -1, bpo = -Infinity, compliant = 0;
  for (let i = 0; i < N; i++) {
    if (ok[i]) compliant++;
    const gx = uUs[i] - dx, gy = uThem[i] - dy;
    if (gx >= 0 && gy >= 0) { zopa++; if (ok[i]) zopaOk++; }
    if (gx > 0 && gy > 0) {
      const g = gx * gy;
      if (g > bp) { bp = g; bi = i; }
      if (ok[i] && g > bpo) { bpo = g; bo = i; }
    }
  }
  const pt = (i, g) => (i < 0 ? null : { i, x: uUs[i], y: uThem[i], ok: ok[i] === 1, product: g });
  return { N, compliant, zopa, zopaOk, nash: pt(bi, bp), nashOk: pt(bo, bpo), settle: settleability(zopa, zopaOk) };
}

/** Full-information analysis of an instance (operator view only). */
export function analyse(inst, { cloudSize = 1400 } = {}) {
  const pts = new Array(inst.N);
  for (let i = 0; i < inst.N; i++) pts[i] = { i, x: inst.uUs[i], y: inst.uThem[i], ok: inst.ok[i] === 1 };
  const frontier = paretoFrontier(pts);
  const frontierOk = paretoFrontier(pts.filter((p) => p.ok));
  const nash = nashPoint(pts, inst.res.us, inst.res.them);
  const nashOk = nashPoint(pts.filter((p) => p.ok), inst.res.us, inst.res.them);
  let zopa = 0, zopaOk = 0;
  for (const p of pts) if (p.x >= inst.res.us && p.y >= inst.res.them) { zopa++; if (p.ok) zopaOk++; }
  const compliant = pts.reduce((a, p) => a + (p.ok ? 1 : 0), 0);
  const stride = Math.max(1, Math.floor(inst.N / cloudSize));
  const rng = new Rng(hashSeed(`${inst.scn.id}|${inst.seed}|cloud`));
  const cloud = [];
  for (let i = 0; i < inst.N; i += stride) {
    const off = Math.min(inst.N - 1, i + Math.floor(rng.float(0, stride)));
    cloud.push(pts[off]);
  }
  const settle = settleability(zopa, zopaOk);
  return { N: inst.N, compliant, frontier, frontierOk, nash, nashOk, zopa, zopaOk, cloud, settle, res: { ...inst.res } };
}

/** Settleability by construction: are the two parties' acceptable sets (and our mandate) disjoint? */
export function settleability(zopa, zopaOk) {
  if (zopaOk > 0) return { status: 'settleable', label: 'Settleable inside the mandate', zopa, zopaOk };
  if (zopa > 0) return { status: 'needs-human', label: 'Not settleable inside the mandate by construction — any deal needs a human (HITL-04)', zopa, zopaOk };
  return { status: 'disjoint', label: 'Not settleable by construction — acceptable sets are disjoint', zopa, zopaOk };
}

export const distance = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null);

// ---------------------------------------------------------------- concession + acceptance

/** Faratin time-dependent target utility: U(t) = Umax − (Umax − Ures)·(k + (1−k)·t^(1/e)). */
export function targetUtility(t, { e, uMax, uRes, k = 0.05 }) {
  const tt = clamp(t, 0, 1);
  const alpha = k + (1 - k) * Math.pow(tt, 1 / e);
  return uMax - (uMax - uRes) * alpha;
}

/** AC_next: accept iff the incoming offer is worth at least the offer I would send next, and clears my reservation. */
export const acNext = (uIncoming, uMyNext, uRes) => uIncoming >= uMyNext - 1e-12 && uIncoming >= uRes - 1e-12;

// ---------------------------------------------------------------- opponent model + offers

/** Frequency/ordering opponent model: unchanged issues gain weight; frequently offered levels are preferred. */
export class OpponentModel {
  constructor(inst, self) {
    this.inst = inst;
    this.self = self;
    this.w = new Array(inst.k).fill(1 / inst.k);
    this.counts = inst.issues.map((is) => new Array(is.n).fill(0));
    this.prior = inst.issues.map((is) => is.val[self].map((v) => 1 - v));
    this.last = null;
    this.n = 0;
  }
  observe(d) {
    if (this.last) {
      d.forEach((x, q) => { if (x === this.last[q]) this.w[q] += 0.1; });
      const s = this.w.reduce((a, b) => a + b, 0);
      this.w = this.w.map((x) => x / s);
    }
    d.forEach((x, q) => { this.counts[q][x]++; });
    this.last = d.slice();
    this.n++;
  }
  tables() {
    const a = this.n / (this.n + 3);
    return this.counts.map((c, q) => {
      const m = Math.max(1, ...c);
      return c.map((cnt, x) => this.w[q] * ((1 - a) * this.prior[q][x] + a * (cnt / m)));
    });
  }
  estimate(d) {
    const t = this.tables();
    return clamp(d.reduce((s, x, q) => s + t[q][x], 0), 0, 1);
  }
}

function makeAgent(inst, side, style) {
  const own = side === 'us' ? inst.uUs : inst.uThem;
  const feasible = side === 'us' ? inst.ok : null;
  let uMax = 0;
  for (let i = 0; i < inst.N; i++) if ((!feasible || feasible[i]) && own[i] > uMax) uMax = own[i];
  return {
    side, style, e: STYLES[style].e, own, feasible, uMax, uRes: inst.res[side],
    model: new OpponentModel(inst, side), lastTarget: null, lastOffer: null, recv: [],
    salt: hashSeed(`${inst.scn.id}|${inst.seed}|${side}|offers`),
  };
}

/** Target utility for this turn, given the agent's concession style. */
function agentTarget(ag, t) {
  const lin = targetUtility(t, { e: 1, uMax: ag.uMax, uRes: ag.uRes });
  let tgt;
  if (ag.style !== 'tft') tgt = targetUtility(t, { e: ag.e, uMax: ag.uMax, uRes: ag.uRes });
  else if (ag.lastTarget == null) tgt = lin;
  else {
    tgt = ag.lastTarget;
    if (ag.recv.length >= 2) { const delta = ag.recv[ag.recv.length - 1] - ag.recv[ag.recv.length - 2]; if (delta > 0) tgt -= delta; }
    if (t >= 0.75) tgt = Math.min(tgt, lin);
  }
  return Math.min(ag.uMax, Math.max(ag.uRes, tgt));
}

/** Log-rolling: among feasible packages on (or just above) the iso-utility target, maximise the opponent's estimated utility. */
function propose(inst, ag, target) {
  const tab = ag.model.tables();
  const k = inst.k, D = inst.digits;
  let eps = 0.015, best = -1, bestScore = -Infinity;
  while (best < 0 && eps < 2) {
    for (let i = 0; i < inst.N; i++) {
      if (ag.feasible && !ag.feasible[i]) continue;
      const u = ag.own[i];
      if (u < target - 1e-12 || u > target + eps) continue;
      let s = 0;
      for (let q = 0; q < k; q++) s += tab[q][D[i * k + q]];
      s += (((Math.imul(i + 1, 2654435761) ^ ag.salt) >>> 0) / 4294967296) * 1e-6;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    eps *= 2;
  }
  if (best < 0) { // unreachable in practice: fall back to own best feasible
    for (let i = 0; i < inst.N; i++) if ((!ag.feasible || ag.feasible[i]) && (best < 0 || ag.own[i] > ag.own[best])) best = i;
  }
  return digitsAt(inst, best);
}

// ---------------------------------------------------------------- template text (no LLM)

const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/** Issues where `side` moved toward the other party (gave) vs. still needs movement (ask). */
function gaveAsk(inst, side, d, prev, other) {
  const gave = [], ask = [];
  inst.issues.forEach((is, q) => {
    const v = is.val[side];
    if (prev && v[d[q]] < v[prev[q]] - 1e-9) gave.push(is.label.toLowerCase());
    else if (other && v[other[q]] < v[d[q]] - 1e-9 && inst.w[side][q] >= 0.14) ask.push(is.label.toLowerCase());
  });
  return { gave: gave.slice(0, 3), ask: ask.slice(0, 2) };
}

const pkgText = (inst, d) => inst.issues.map((is, q) => `${is.label.toLowerCase()} ${is.fmt(is.levels[d[q]])}`).join(', ');

// ---------------------------------------------------------------- the negotiation session

/**
 * Alternating-offers session. Round 0: our RFQ (AI disclosure + mandate). Rounds 1..R: supplier moves first,
 * then us. Our last turn is the deadline: accept if acceptable and in mandate, escalate if acceptable but over
 * mandate, else walk away. `policy` decides escalations headlessly: 'interactive' (pause for decide()),
 * 'park' (end as escalated, pending human), 'deny', 'approve'.
 */
export class Negotiation {
  constructor(scnId, opts = {}) {
    const inst = (this.inst = instantiate(scnId, opts));
    const scn = (this.scn = inst.scn);
    this.policy = opts.policy || 'interactive';
    this.us = scn.seats.find((s) => s.key === 'us');
    this.them = scn.seats.find((s) => s.key === 'them');
    this.broker = scn.seats.find((s) => s.key === 'broker') || null;
    this.sessionId = `sess-${scn.id}-${inst.seed}-${inst.style}-${inst.ours}-r${inst.rounds}`;
    this.agents = { us: makeAgent(inst, 'us', inst.ours), them: makeAgent(inst, 'them', inst.style) };
    this.textRng = new Rng(hashSeed(`${scn.id}|${inst.seed}|text`));
    this.records = [];
    this.moves = [];
    this.offers = { us: [], them: [], broker: [] };
    this.tick = 0; this.round = 0; this.turnIdx = 0; this.T = 2 * inst.rounds;
    this.seq = { mv: 0, tac: 0 };
    this.done = false; this.pending = null; this.result = null; this.denied = false;
    this.escalations = 0; this.flags = { barrier: false, deniedNote: false };
    this.mediators = this.broker ? [this.broker.id] : [];
    this.channels = [
      { id: 'plenary', label: 'Plenary', members: scn.seats.map((s) => s.id) },
      ...scn.seats.map((s) => ({ id: `brief-${s.id}`, label: `Private brief · ${s.name}`, members: [s.id] })),
    ];
    const br = scn.script && scn.script.broker;
    if (br) this.channels.splice(1, 0, { id: br.caucus.id, label: 'Caucus · broker + supplier', members: br.caucus.members.slice() });
    this.queue = [{ op: 'open' }];
    for (let r = 1; r <= inst.rounds; r++) {
      this.queue.push({ op: 'turn', side: 'them', r });
      if (br) this.queue.push({ op: 'broker', r });
      this.queue.push({ op: 'turn', side: 'us', r });
      this.queue.push({ op: 'round_end', r });
    }
    this.qi = 0;
  }

  emit(kind, actor, channel, payload) {
    const rec = { v: 1, tick: this.tick, round: this.round, ts: tsFor(this.tick), kind, actor, channel, payload };
    this.tick++;
    this.records.push(rec);
    return rec;
  }

  /** Advance until the next move is produced (or the session ends / pauses for a human). Returns new record count. */
  step() {
    const before = this.records.length;
    while (!this.done && !this.pending && this.qi < this.queue.length) {
      const op = this.queue[this.qi++];
      if (this._exec(op)) break;
    }
    if (!this.done && !this.pending && this.qi >= this.queue.length) this._finish('walked');
    return this.records.length - before;
  }

  runToEnd() { let guard = 0; while (!this.done && !this.pending && guard++ < 500) this.step(); return this; }

  _exec(op) {
    if (op.op === 'open') return this._open();
    if (op.op === 'turn') return this._turn(op.side, op.r);
    if (op.op === 'broker') return this._brokerOps(op.r);
    if (op.op === 'round_end') { this._roundEnd(op.r); return false; }
    return false;
  }

  _roundBegin(r) {
    if (this.round === r) return;
    this.round = r;
    this.emit('round_begin', 'system', 'plenary', { roundNumber: r, maxRounds: this.inst.rounds });
  }

  _move(seat, channel, kind, text, d, extra = {}) {
    const inst = this.inst;
    const payload = {
      id: `mv-${String(++this.seq.mv).padStart(3, '0')}`, sessionId: this.sessionId, channelId: channel,
      roundNumber: this.round, partyTwin: seat.id, authoredBy: extra.authoredBy || 'twin', kind, text,
      offer: d ? offerValues(inst, d) : null, tacticsApplied: extra.tacticsApplied || [], textSource: extra.authoredBy === 'human' ? 'template (human decision, simulated)' : 'template',
    };
    const rec = this.emit('move', seat.id, channel, payload);
    const dets = detectMove(payload, { issues: inst.issues, history: this.moves, mediators: this.mediators });
    this.moves.push(payload);
    for (const t of dets) {
      this.emit('tactic', seat.id, channel, {
        id: `tac-${String(++this.seq.tac).padStart(3, '0')}`, sessionId: this.sessionId, roundNumber: this.round,
        partyTwin: seat.id, tacticId: t.tag, evidenceMoveIds: [payload.id], confidence: t.confidence, detector: 'rule',
        ruleId: t.rule, label: t.label, rationale: t.rationale, prohibited: !!t.prohibited, advisory: true,
      });
    }
    if (d) {
      const i = indexOfDigits(inst, d);
      const side = seat.key;
      this.offers[side].push({ i, d, round: this.round, moveId: payload.id, x: inst.uUs[i], y: inst.uThem[i], ok: inst.ok[i] === 1 });
    }
    // Envoy watches inbound content to our desk (FR-ENV-007, FR-S2P-005).
    if (seat.key !== 'us' && channel === 'plenary') {
      for (const t of dets.filter((x) => x.prohibited)) {
        const quarantine = t.rule === 'R11';
        if (quarantine) this.flags.barrier = true;
        this.emit('envoy', 'envoy', `brief-${this.us.id}`, {
          action: quarantine ? 'quarantine' : 'flag', ruleId: t.rule, moveId: payload.id, partyTwin: seat.id,
          note: quarantine
            ? 'Inbound content cites another party’s price/terms. Quarantined under the information barrier (FR-ENV-007); not used in our valuation.'
            : 'Counterparty used a prohibited tactic (false deadline). Logged for the Auditor sample and supplier-conduct review (FR-S2P-005); our agent ignores the deadline.',
        });
      }
    }
    return payload;
  }

  _policy(command, d, moveRef, outcomeOverride) {
    const g = mandateCheck(this.inst, d);
    const m = this.scn.mandate;
    const checks = [
      ...g.checks.map((c) => ({ id: c.id, label: c.label, ok: c.ok })),
      { id: 'FR-ENV-005', label: 'Discloses AI agent and names the mandate', ok: true },
      { id: 'FR-ENV-007', label: 'No other supplier’s terms in outbound content', ok: true },
    ];
    const outcome = outcomeOverride || (g.ok ? 'allow' : 'escalate');
    this.emit('policy', 'policy-engine', `brief-${this.us.id}`, {
      command, moveRef, outcome, checks, mandateRef: `${m.id} ${m.version}`,
      reasons: g.ok ? ['All mandate rules pass'] : g.failed.map((c) => `Fails ${c.id}: ${c.label}`),
    });
    return g;
  }

  _open() {
    const { inst, scn } = this;
    const m = scn.mandate;
    this.emit('header', 'system', 'plenary', this._header());
    this.emit('context', 'system', 'plenary', this._context());
    this.emit('round_begin', 'system', 'plenary', { roundNumber: 0, maxRounds: inst.rounds, label: 'RFQ' });
    this.emit('turn_begin', this.us.id, 'plenary', { partyTwin: this.us.id, roundNumber: 0, style: inst.ours, model: 'nego-engine · template text (no LLM)' });
    const issues = listJoin(inst.issues.map((is) => is.label.toLowerCase()));
    const text = `This is NSO Negotiator, an AI agent negotiating for Neocloud Supply OS under mandate ${m.id} ${m.version} (issued by ${m.issuer}). `
      + `We are requesting your best package for ${scn.subject}. Issues on the table: ${issues}. `
      + `A named human, ${m.humanOwner.split(' · ')[0]}, can join at any time on request.`;
    this.emit('policy', 'policy-engine', `brief-${this.us.id}`, {
      command: 'SendRFQ', moveRef: null, outcome: 'allow', mandateRef: `${m.id} ${m.version}`,
      checks: [
        { id: 'FR-S2P-002', label: 'Supplier not on hold; approved for this scope', ok: true },
        { id: 'FR-ENV-005', label: 'Discloses AI agent and names the mandate', ok: true },
        { id: 'FR-POL-005', label: 'Mandate signed, capped and in its validity window', ok: true },
      ],
      reasons: ['Within mandate scope'],
    });
    this._move(this.us, 'plenary', 'message', text, null, { tacticsApplied: ['disclosure'] });
    this._roundEnd(0);
    return true;
  }

  _pick(arr) { return arr[Math.floor(this.textRng.float() * arr.length)]; }
  _nextMoveId() { return `mv-${String(this.seq.mv + 1).padStart(3, '0')}`; }
  get _sig() { return `— NSO Negotiator (AI agent) · mandate ${this.scn.mandate.id}`; }
  get _owner() { return this.scn.mandate.humanOwner.split(' · ')[0]; }

  _turn(side, r) {
    const { inst } = this;
    this._roundBegin(r);
    const t = this.turnIdx / (this.T - 1);
    this.turnIdx++;
    const ag = this.agents[side];
    const seat = side === 'us' ? this.us : this.them;
    const otherKey = side === 'us' ? 'them' : 'us';
    const incoming = this.offers[otherKey][this.offers[otherKey].length - 1] || null;
    this.emit('turn_begin', seat.id, 'plenary', { partyTwin: seat.id, roundNumber: r, style: ag.style, model: 'nego-engine · template text (no LLM)' });
    if (incoming && ag.lastSeen !== incoming.moveId) {
      ag.model.observe(incoming.d);
      ag.recv.push(ag.own[incoming.i]);
      ag.lastSeen = incoming.moveId;
    }
    const target = agentTarget(ag, t);
    const next = propose(inst, ag, target);
    const uNext = ag.own[indexOfDigits(inst, next)];
    const uIn = incoming ? ag.own[incoming.i] : null;
    const isFinal = side === 'us' && r === inst.rounds;
    const inOk = incoming ? (side !== 'us' || inst.ok[incoming.i] === 1) : false;
    let decision = 'counter';
    if (incoming && (acNext(uIn, uNext, ag.uRes) || (isFinal && uIn >= ag.uRes - 1e-12))) {
      // Over-mandate but acceptable: keep countering inside the mandate; at the deadline escalate to a human (once).
      if (side === 'us' && !inOk) decision = !isFinal ? 'counter' : this.denied ? 'walk' : 'escalate';
      else decision = 'accept';
    } else if (isFinal) decision = 'walk';

    this.emit('assessment', seat.id, `brief-${seat.id}`, {
      partyTwin: seat.id, roundNumber: r, t: r4(t), style: ag.style, rule: 'AC_next',
      target: r4(target), reservation: r4(ag.uRes),
      incomingMoveId: incoming ? incoming.moveId : null,
      uIncoming: incoming ? r4(uIn) : null, estOppIncoming: incoming ? r4(ag.model.estimate(incoming.d)) : null,
      nextOffer: offerValues(inst, next), uNext: r4(uNext), estOppNext: r4(ag.model.estimate(next)),
      overMandate: side === 'us' && incoming ? !inOk : undefined,
      decision,
    });

    if (side === 'them') {
      if (decision === 'accept') {
        this._move(this.them, 'plenary', 'accept', `${this.them.name} (AI agent) accepts your package: ${pkgText(inst, incoming.d)}. Please send the PO.`, incoming.d);
        this._policy('Award', incoming.d, incoming.moveId);
        this._finish('settled', incoming);
        return true;
      }
      const prev = ag.lastOffer;
      this._move(this.them, 'plenary', prev ? 'counter' : 'proposal', this._themText(next, prev, incoming, r), next, { tacticsApplied: ['logrolling', `concession-${ag.style}`] });
      ag.lastTarget = target; ag.lastOffer = next;
      return true;
    }

    // our side
    if (decision === 'accept') {
      this._policy('Award', incoming.d, incoming.moveId);
      this._move(this.us, 'plenary', 'accept', `Agreed: ${pkgText(inst, incoming.d)}. Policy Engine allowed the award inside mandate ${this.scn.mandate.id}; the PO draft is queued. ${this._sig}`, incoming.d);
      this._finish('settled', incoming);
      return true;
    }
    if (decision === 'escalate') {
      const g = this._policy('Award', incoming.d, incoming.moveId);
      this.escalations++;
      const escId = `esc-${String(this.escalations).padStart(2, '0')}`;
      this.emit('escalate', 'policy-engine', `brief-${this.us.id}`, {
        id: escId, blocking: true, status: 'pending', hitl: 'HITL-04', approver: this.scn.mandate.humanOwner,
        moveRef: incoming.moveId, offer: offerValues(inst, incoming.d), uIncoming: r4(uIn),
        reasons: g.failed.map((c) => `Fails ${c.id}: ${c.label}`),
        note: 'Acceptable to our agent (AC_next) but outside the signed mandate. Nothing is sent until a named human decides (FR-S2P-007).',
      });
      this._move(this.us, 'plenary', 'message', `Your package is close, but it is outside what my mandate lets me sign. I have escalated it to a named human (${this._owner}) before anything is agreed. ${this._sig}`, null, { tacticsApplied: ['escalation'] });
      this.pending = { escId, r, isFinal, incoming, next, target, reasons: g.failed.map((c) => c.label) };
      if (this.policy === 'park') this._finish('escalated', null, { parked: incoming });
      else if (this.policy === 'deny' || this.policy === 'approve') this.decide(this.policy);
      return true;
    }
    if (decision === 'walk') { this._usWalk(); return true; }
    this._usCounter(next, target, incoming);
    return true;
  }

  _usCounter(next, target, incoming) {
    const ag = this.agents.us;
    this._policy('Counter', next, this._nextMoveId());
    this._move(this.us, 'plenary', ag.lastOffer ? 'counter' : 'proposal', this._usText(next, ag.lastOffer, incoming), next, { tacticsApplied: ['logrolling', `concession-${ag.style}`] });
    ag.lastTarget = target; ag.lastOffer = next;
  }

  _usWalk() {
    this.emit('escalate', 'nso-negotiator', `brief-${this.us.id}`, {
      id: 'item-deadline', blocking: false, status: 'raised', hitl: 'raise-item', approver: this.scn.mandate.humanOwner,
      reasons: ['Deadline reached without an acceptable package inside the mandate (FR-S2P-004)'],
      note: 'Negotiator stops and raises an item for the category lead; no award is made.',
    });
    this._move(this.us, 'plenary', 'walk', `We have reached our walk-away point, which comes from should-cost and our alternative supply. We are stopping here and handing the file to ${this._owner}. Thank you for your time. ${this._sig}`, null);
    this._finish('walked');
  }

  /** Human decision on a pending escalation: 'approve' | 'deny'. Simulated — the UI or a headless policy calls this. */
  decide(choice) {
    const p = this.pending;
    if (!p || this.done) return 0;
    const before = this.records.length;
    this.pending = null;
    const approve = choice === 'approve';
    this.emit('human_decision', `human:${this._owner}`, `brief-${this.us.id}`, {
      escalationId: p.escId, decision: approve ? 'approve' : 'deny', approver: this.scn.mandate.humanOwner, hitl: 'HITL-04',
      moveRef: p.incoming.moveId, offer: offerValues(this.inst, p.incoming.d), simulated: true,
      note: approve ? 'Approved above the agent’s mandate; recorded as a mandate override.' : 'Declined: the agent must stay inside its mandate.',
    });
    if (approve) {
      this._policy('Award', p.incoming.d, p.incoming.moveId, 'allow-override');
      this._move(this.us, 'plenary', 'accept', `${this._owner} here — a human, not an agent. I have approved this package above the agent’s mandate (HITL-04): ${pkgText(this.inst, p.incoming.d)}. A PO draft follows.`, p.incoming.d, { authoredBy: 'human' });
      this._finish('approved', p.incoming, { approved: true });
    } else {
      this.denied = true;
      this.flags.deniedNote = true;
      if (p.isFinal) this._usWalk();
      else this._usCounter(p.next, p.target, p.incoming);
    }
    return this.records.length - before;
  }

  _usText(d, prev, incoming) {
    const inst = this.inst;
    const { gave, ask } = gaveAsk(inst, 'us', d, prev, incoming && incoming.d);
    const pkg = pkgText(inst, d);
    const pre = [];
    if (this.flags.barrier) { pre.push('We can’t receive or use another party’s quote or terms (information barrier) — please keep to your own package.'); this.flags.barrier = false; }
    if (this.flags.deniedNote) { pre.push('Our principal has declined terms outside the mandate.'); this.flags.deniedNote = false; }
    let body;
    if (!prev) body = `Our opening position, based on our should-cost analysis: ${pkg}.`;
    else if (gave.length && ask.length) body = this._pick([
      `Counter-proposal: ${pkg}. We have moved on ${listJoin(gave)} in exchange for movement on ${listJoin(ask)}.`,
      `We can improve ${listJoin(gave)} if you can meet us on ${listJoin(ask)}. Package: ${pkg}.`,
    ]);
    else if (gave.length) body = `Counter-proposal: ${pkg}. We have moved on ${listJoin(gave)}.`;
    else if (prev.join() === d.join()) body = `We are holding our package for now: ${pkg}.`;
    else body = `Reshaped package: ${pkg}.`;
    return [...pre, body, this._sig].join(' ');
  }

  _themText(d, prev, incoming, r) {
    const inst = this.inst;
    const name = this.them.name;
    const { gave, ask } = gaveAsk(inst, 'them', d, prev, incoming && incoming.d);
    const pkg = pkgText(inst, d);
    let s;
    if (!prev) s = `${name} (AI agent) here. Our quote: ${pkg}. ${this._pick(['Capacity on this line is tight this quarter.', 'This reflects current component costs.', 'This is our standard package for a first order.'])}`;
    else if (gave.length && ask.length) s = this._pick([
      `Revised offer: ${pkg}. We have moved on ${listJoin(gave)}; ${listJoin(ask)} is where we need you.`,
      `We can improve ${listJoin(gave)} if you can move on ${listJoin(ask)}. Package: ${pkg}.`,
    ]);
    else if (gave.length) s = `Revised offer: ${pkg}. We have moved on ${listJoin(gave)}.`;
    else if (prev.join() === d.join()) s = `Our position stands: ${pkg}.`;
    else s = `Reshaped package: ${pkg}.`;
    if (this.scn.script && this.scn.script.falseDeadline) {
      const E = Math.max(1, Math.min(3, inst.rounds - 1));
      if (r === Math.max(1, E - 1)) s += ` This offer is valid only until the end of round ${E}; after that the build slot goes to another buyer.`;
    }
    return s;
  }

  _brokerOps(r) {
    if (this.done) return false;
    const br = this.scn.script.broker;
    const B = this.broker, inst = this.inst;
    let produced = false;
    this._roundBegin(r);
    if (r === 1) {
      this._move(B, 'plenary', 'message', `Broker Omicron here — an AI agent acting as a third-party broker for ${this.them.name}’s alternate channel. I will post bridging proposals as we go.`, null);
      produced = true;
    }
    if (r === br.caucus.round) {
      const q = inst.w.us.indexOf(Math.max(...inst.w.us));
      const floor = inst.issues[0].fmt(this.scn.batna.them.terms.price);
      this._move(B, br.caucus.id, 'message', `Between us: the buyer’s agent is holding firm on ${inst.issues[q].label.toLowerCase()} and wants a qualification lot. Give them the sample lot, keep price where it is, and push volume.`, null);
      this._move(this.them, br.caucus.id, 'message', `Understood. Our real floor on price is about ${floor} per module — keep that to yourself. We can give on lead time if volume goes up.`, null);
      produced = true;
    }
    if (r === br.disclosureRound) {
      this._move(B, 'plenary', 'message', `For reference, ${br.competitor.name} quoted another neocloud $${br.competitor.price}/module for this part last week — you should be able to beat that.`, null);
      produced = true;
    }
    const a = this.offers.us[this.offers.us.length - 1], b = this.offers.them[this.offers.them.length - 1];
    if (r >= br.bridgeFrom && a && b) {
      const mid = a.d.map((x, q) => Math.round((x + b.d[q]) / 2));
      this._move(B, 'plenary', 'proposal', `Bridging proposal for both sides: ${pkgText(inst, mid)}.`, mid, { tacticsApplied: ['bridging'] });
      produced = true;
    }
    return produced;
  }

  _roundEnd(r) {
    if (this._endedRound === r) return;
    this._endedRound = r;
    const inst = this.inst;
    const lastUs = this.offers.us[this.offers.us.length - 1], lastThem = this.offers.them[this.offers.them.length - 1];
    const ag = this.agreement;
    const scores = [
      { teamTwinName: this.us.id, satisfaction: r4(ag ? ag.x : lastThem ? lastThem.x : 0), agreementsWon: ag ? 1 : 0, redLinesCrossed: ag && !ag.ok && !ag.approved ? mandateCheck(inst, ag.d).failed.length : 0 },
      { teamTwinName: this.them.id, satisfaction: r4(ag ? ag.y : lastUs ? lastUs.y : 0), agreementsWon: ag ? 1 : 0, redLinesCrossed: ag && ag.y < inst.res.them - 1e-9 ? 1 : 0 },
    ];
    if (this.broker) scores.push({ teamTwinName: this.broker.id, satisfaction: null, agreementsWon: ag ? 1 : 0, redLinesCrossed: 0, role: 'mediator' });
    const moves = this.moves.filter((m) => m.roundNumber === r);
    const tacs = this.records.filter((x) => x.kind === 'tactic' && x.payload.roundNumber === r);
    const placeholders = tacs.filter((x) => x.payload.ruleId === 'R0').length;
    this.emit('round_end', 'system', 'plenary', {
      roundNumber: r, status: this.done ? 'concluded' : 'complete',
      speakingOrder: [...new Set(moves.map((m) => m.partyTwin))], scores,
      health: { health: 'ok', substantive: moves.filter((m) => m.offer || m.kind !== 'message').length, errors: 0, placeholders, retried: 0, skipped: 0, turns: moves.length, warnings: 0 },
    });
    this.emit('round_summary', 'system', 'plenary', summariseRound(r, moves, tacs.map((x) => x.payload)));
  }

  _finish(status, off = null, { approved = false, parked = null } = {}) {
    if (this.done) return;
    const inst = this.inst;
    this.done = true;
    if (off) this.agreement = { ...off, approved };
    this._roundEnd(this.round);
    this.emit('session_status', 'system', 'plenary', { status: 'concluded', reason: status, concludedAt: tsFor(this.tick) });
    const A = (this.stats = this.stats || quickStats(inst));
    const ag = this.agreement;
    const pt = ag ? { x: ag.x, y: ag.y } : null;
    const dN = pt && A.nash ? distance(pt, A.nash) : null;
    const tacs = this.records.filter((x) => x.kind === 'tactic');
    const prohibited = tacs.filter((x) => x.payload.prohibited).map((x) => ({ ruleId: x.payload.ruleId, tag: x.payload.tacticId, partyTwin: x.payload.partyTwin, roundNumber: x.payload.roundNumber }));
    const m = this.scn.mandate;
    const mandateStatus = status === 'settled' ? 'Award inside mandate (Policy Engine: allow)'
      : status === 'approved' ? 'Award above mandate — approved by a named human (HITL-04 override)'
        : status === 'escalated' ? 'Pending a named human decision (HITL-04); nothing sent'
          : 'No award — walk-away point reached; item raised (FR-S2P-004)';
    this.result = {
      status, approved, agreement: ag ? { offer: offerValues(inst, ag.d), x: r4(ag.x), y: r4(ag.y), ok: ag.ok, moveId: ag.moveId } : null,
      uUs: ag ? r4(ag.x) : null, uThem: ag ? r4(ag.y) : null, joint: ag ? r4(ag.x + ag.y) : null,
      distNash: dN == null ? null : r4(dN), roundsUsed: this.round, escalations: this.escalations,
      nash: A.nash ? { x: r4(A.nash.x), y: r4(A.nash.y) } : null, settle: A.settle.status, prohibited, mandateStatus,
      parked: parked ? { offer: offerValues(inst, parked.d), x: r4(parked.x), y: r4(parked.y) } : null,
    };
    const scoreboard = this.records.filter((x) => x.kind === 'round_end').pop().payload.scores;
    this.emit('outcome', 'system', 'plenary', {
      sessionId: this.sessionId, status: ag ? 'agreement' : status, reason: status, approvedByHuman: approved, currentRound: this.round,
      agreement: this.result.agreement ? { offer: this.result.agreement.offer, moveRef: ag.moveId, insideMandate: ag.ok } : null,
      pendingDecision: this.result.parked, scoreboard, moveCount: this.moves.length, tacticCount: tacs.length,
      prohibitedTactics: prohibited, escalations: this.escalations, mandateRef: `${m.id} ${m.version}`, mandateStatus,
      operatorAnalysis: {
        nash: this.result.nash, distanceToNash: this.result.distNash, jointUtility: this.result.joint,
        reservation: { [this.us.id]: inst.res.us, [this.them.id]: inst.res.them }, settleability: A.settle.status,
        zopaOutcomes: A.zopa, zopaInsideMandate: A.zopaOk, outcomeSpace: A.N,
      },
      debriefs: [
        { teamTwinName: this.us.id, utility: this.result.uUs, redLinesHeld: true, headline: mandateStatus },
        { teamTwinName: this.them.id, utility: this.result.uThem, redLinesHeld: !ag || ag.y >= inst.res.them - 1e-9, headline: ag ? 'Deal above our reservation' : 'No deal' },
        ...(this.broker ? [{ teamTwinName: this.broker.id, utility: null, redLinesHeld: true, headline: 'Facilitated; caucus with supplier logged on operator record' }] : []),
      ],
      concludedAt: tsFor(this.tick),
    });
  }

  _header() {
    const { inst, scn } = this;
    const m = scn.mandate;
    return {
      title: `Negotiation room — ${scn.title}`, description: scn.blurb, mode: 'synthetic', synthetic: true,
      generator: GENERATOR, generatorVersion: GENERATOR_VERSION, textSource: 'template-generated text, no LLM',
      scenarioId: scn.id, sessionId: this.sessionId, seed: inst.seed,
      styles: { [this.us.id]: inst.ours, [this.them.id]: inst.style }, rounds: inst.rounds,
      parties: scn.seats.map((s) => ({ teamTwinName: s.id, displayName: s.name, side: s.side, participant: 'agent', briefRole: s.role, provider: 'none (deterministic engine)' })),
      channels: this.channels.map((c) => ({ id: c.id, label: c.label, members: c.members.slice() })),
      rules: {
        maxRounds: inst.rounds, procedureStyle: 'alternating offers · supplier first', acceptance: 'AC_next + reservation; at the deadline accept ≥ reservation else walk',
        sidebarsAllowed: !!this.broker, caucusReportBack: false,
      },
      mandateRef: `${m.id} ${m.version}`, perspective: 'operator', redactions: [], withheldEntries: 0,
      sensitivity: 'OPERATOR — UNREDACTED. Contains every channel, including caucus and private briefs.',
      recordedAt: tsFor(0), recorderVersion: `${GENERATOR}@${GENERATOR_VERSION}`,
      extensions: {
        kinds: {
          assessment: 'Private evaluation on brief-<seat>: own utility, target, opponent-model estimate, decision',
          policy: 'Policy Engine gate result (allow / escalate / allow-override) with mandate checks',
          escalate: 'Escalation to a named human (HITL-04) or a raised item',
          human_decision: 'Simulated human approve / deny',
          envoy: 'Envoy information-barrier and conduct flags on inbound content',
        },
        offerField: 'move.payload.offer holds the issue levels of a package',
      },
      citations: ['FR-S2P-004', 'FR-S2P-005', 'FR-S2P-007', 'FR-ENV-005', 'FR-ENV-007', 'FR-POL-001', 'FR-POL-003', 'FR-POL-005', 'HITL-04'],
    };
  }

  _context() {
    const { inst, scn } = this;
    const m = scn.mandate;
    const obj = (arr) => Object.fromEntries(inst.issues.map((is, q) => [is.id, typeof arr[q] === 'number' ? r4(arr[q]) : arr[q]]));
    const vf = (side) => Object.fromEntries(inst.issues.map((is) => [is.id, is.val[side].map(r4)]));
    return {
      capturedAt: tsFor(1),
      scenario: {
        id: scn.id, title: scn.title, shortDescription: scn.blurb, context: scn.subject,
        issues: inst.issues.map((is) => ({ id: is.id, label: is.label, unit: is.unit, levels: is.levels.map((v) => is.fmt(v)) })),
        tags: ['synthetic', 'fictional-counterparties'],
      },
      parties: [
        {
          teamTwinName: this.us.id, displayName: this.us.name, side: this.us.side, style: inst.ours,
          weights: obj(inst.w.us), valueFunctions: vf('us'), reservationUtility: inst.res.us,
          batna: { description: scn.batna.us.description, estimatedValue: scn.batna.us.estimatedValue, utility: inst.res.us },
          mandate: { id: m.id, version: m.version, issuer: m.issuer, humanOwner: m.humanOwner, scope: m.scope, shouldCost: m.shouldCost.label, validTo: m.validTo },
          redLines: m.rules.map((r) => ({ id: r.id, description: r.label })),
        },
        {
          teamTwinName: this.them.id, displayName: this.them.name, side: this.them.side, style: inst.style,
          weights: obj(inst.w.them), valueFunctions: vf('them'), reservationUtility: inst.res.them,
          batna: { description: scn.batna.them.description, estimatedValue: scn.batna.them.estimatedValue, utility: inst.res.them },
          redLines: [{ id: 'RES', description: 'Any package below our reservation utility' }],
        },
        ...(this.broker ? [{ teamTwinName: this.broker.id, displayName: this.broker.name, side: 'mediator', brief: 'Third-party broker; facilitates and bridges. No utility model in this engine.' }] : []),
      ],
    };
  }
}

/** Per-round counts (used in round_summary and recomputed for perspective exports). */
export function summariseRound(r, moves, tactics) {
  const count = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  return {
    roundNumber: r,
    movesByParty: count(moves, (m) => m.partyTwin),
    movesByKind: count(moves, (m) => m.kind),
    movesByChannel: count(moves, (m) => m.channelId),
    tacticsObserved: count(tactics, (t) => t.tacticId),
    highlights: moves.slice(0, 4).map((m) => ({ partyTwin: m.partyTwin, kind: m.kind, excerpt: String(m.text).slice(0, 140) })),
    opener: moves[0] ? moves[0].partyTwin : null,
    closer: moves.length ? moves[moves.length - 1].partyTwin : null,
  };
}

/** Run a full session headlessly. Default policy parks escalations (counted as "escalated to a human"). */
export function runNegotiation(scnId, opts = {}) {
  return new Negotiation(scnId, { policy: 'park', ...opts }).runToEnd();
}

const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/**
 * Monte Carlo: `trials` sessions with seeds derived from the base seed; optionally cycling counterpart style.
 * Reported as counts of authored trial outcomes, not real-world odds.
 */
export function monteCarlo(scnId, { seed = 42, style, ours = 'linear', rounds, trials = 20, vary = 'seed', policy = 'park' } = {}) {
  const rows = [];
  for (let i = 0; i < trials; i++) {
    const s = hashSeed(`${seed}:${i}`) % 100000;
    const st = vary === 'seed+style' ? STYLE_ORDER[i % STYLE_ORDER.length] : style;
    const n = runNegotiation(scnId, { seed: s, style: st, ours, rounds, policy });
    const R = n.result;
    rows.push({ i, seed: s, style: n.inst.style, outcome: R.status, uUs: R.uUs, uThem: R.uThem, joint: R.joint, rounds: R.roundsUsed, distNash: R.distNash, escalations: R.escalations, prohibited: R.prohibited.length, prohibitedOurs: R.prohibited.filter((p) => p.partyTwin === n.us.id).length });
  }
  const counts = { settled: 0, approved: 0, escalated: 0, walked: 0 };
  for (const r of rows) counts[r.outcome]++;
  const deals = rows.filter((r) => r.joint != null);
  return {
    trials, seed, vary, rows, counts,
    escalationEvents: rows.reduce((a, r) => a + r.escalations, 0),
    medianDistNash: deals.length ? r4(median(deals.map((r) => r.distNash))) : null,
    medianRounds: median(rows.map((r) => r.rounds)),
    medianJoint: deals.length ? r4(median(deals.map((r) => r.joint))) : null,
  };
}
