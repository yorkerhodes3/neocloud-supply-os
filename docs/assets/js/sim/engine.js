// Neocloud Supply OS: deterministic discrete-event simulation of contract → billable capacity.
// Pure module (no DOM). Same seed + options → identical ledger, in the browser or in node.
//
// Method notes (also rendered on simulate.html):
// - Physical durations (manufacture, transit, construction, failures) are drawn from
//   common random numbers keyed by line and stage, so the agent-native and legacy runs
//   face the same physical world. Only administrative latency and the response to
//   disruptions differ between modes.
// - Every number is modelled or illustrative. See ASSUMPTIONS below.
import { Rng, hashSeed } from '../lib/rng.js';
import { SITES, SUPPLIERS, supplier, lane, densify, measure, HQ, GPUS_PER_RACK, RACKS_PER_LOT } from './world.js';
import { provider as riskProvider, chain as riskChain, call as riskCall } from '../providers.js';

export const MODES = { native: 'Agent-native', legacy: 'Legacy (modelled)' };
export const PRICE_PER_GPU_HOUR = 2.1;       // illustrative contract rate, $
export const RACK_COST_M = 3.4;              // illustrative rack-scale system cost, $M
export const RACK_DEPRECIATION_DAY = RACK_COST_M * 1e6 / (5 * 365.25);
export const REPORT_DAY = 200;            // common horizon for revenue comparisons

export const MATERIALS = {
  rack:   { label: 'GPU rack lot', unit: `${RACKS_PER_LOT} × ${GPUS_PER_RACK}-GPU racks`, sup: () => 'ODM1', mode: 'air', make: [24, 28, 36], value: RACKS_PER_LOT * RACK_COST_M, per: 'lot', jit: true },
  optics: { label: 'Optics lot', unit: '1,152 × 800G transceivers', sup: () => 'OPT1', mode: 'air', make: [16, 20, 28], value: 1.1, per: 'lot', jit: true },
  switch: { label: 'Switch lot', unit: 'leaf + spine switches', sup: () => 'NET', mode: 'auto', make: [14, 18, 24], value: 0.8, per: 'lot', jit: true },
  cdu:    { label: 'CDU set', unit: '8 coolant distribution units', sup: () => 'CDU', mode: 'auto', make: [40, 48, 62], value: 2.2, per: 'hall' },
  swgr:   { label: 'Switchgear & UPS', unit: 'MV line-up per hall', sup: () => 'SWG', mode: 'auto', make: [46, 54, 68], value: 3.0, per: 'hall' },
  xfmr:   { label: 'Power transformer', unit: '1 × 60 MVA (slot reserved)', sup: s => (s.id === 'TX1' ? 'XF1' : 'XF2'), mode: 'auto', make: [62, 72, 90], value: 4.4, per: 'site' },
  build:  { label: 'Hall shell & fit-out', unit: 'EPC package', sup: s => (s.id === 'TX1' ? 'EPC' : 'EPCE'), per: 'hall', value: 38 },
};

const SHIP_PIPE = ['plan', 'release', 'screen', 'source', 'order', 'make', 'ship', 'clear', 'haul', 'receive', 'stock'];
const BUILD_PIPE = ['plan', 'screen', 'source', 'order', 'build'];
const DESK = {
  plan: 'Planner', release: 'Planner', screen: 'Screener', source: 'Negotiator', order: 'Buyer', make: 'Buyer',
  ship: 'Dispatcher', clear: 'Customs', haul: 'Dispatcher', receive: 'Registrar', stock: 'Registrar', build: 'Project Controller',
};
const CONN = { A: 'A2A', B: 'hosted agent', C: 'Envoy → email' };
/** In the legacy run the same work is done by people in functional teams. */
export const LEGACY_ROLE = { Planner: 'Planning team', Screener: 'Compliance', Negotiator: 'Buyer', Registrar: 'Receiving', Customs: 'Customs broker', Deployer: 'Site ops', Commissioner: 'Commissioning', 'Project Controller': 'PMO', 'Power Broker': 'Energy team', Returns: 'RMA desk', Dispatcher: 'Logistics', Conductor: 'Ops lead', Allocator: 'Planning team', Watchtower: 'Inbox', Payables: 'AP clerk', Auditor: 'Internal audit', Mapper: 'Inbox', Provenance: 'Trade compliance', 'LLE Expeditor': 'Buyer', 'Category Strategist': 'Category manager', 'Treasury Aide': 'Treasury', Resilience: 'Ops lead', 'Quality Sentinel': 'Quality' };
const FAM_DESK = { Sourcing: 'Negotiator', Ordering: 'Buyer', Collaboration: 'Planner', Logistics: 'Dispatcher', Finance: 'Payables', 'Risk and compliance': 'Screener', 'Quality and change': 'Quality Sentinel' };

/** Administrative latency in days, triangular (min, mode, max). Physical durations live in MATERIALS and transit(). */
export const ADMIN = {
  native: {
    plan: [0.02, 0.05, 0.12], screen: [0.01, 0.02, 0.06],
    source: { A: [0.05, 0.12, 0.3], B: [0.3, 0.6, 1.2], C: [1.0, 1.8, 3.5] },
    order: { A: [0.01, 0.03, 0.08], B: [0.15, 0.4, 0.9], C: [0.5, 1.2, 2.5] },
    clear: [0.2, 0.5, 1.2], receive: [0.04, 0.1, 0.25], workorder: [0.02, 0.05, 0.1],
    install: [2, 2.5, 3.5], burnin: [2, 2.5, 3.5], energize: [6, 8, 11], commission: [4, 5, 7],
    human: [0.08, 0.3, 1.0], rma: [1, 2, 3], invoice: [0.1, 0.3, 0.8], pay: [10, 14, 15],
  },
  legacy: {
    plan: [1, 2, 4], planCycle: 7, screen: [0.5, 1.5, 4],
    source: { A: [5, 8, 14], B: [5, 8, 14], C: [6, 10, 16] },
    order: { A: [1.5, 3, 6], B: [1.5, 3, 6], C: [2, 4, 8] },
    clear: [1, 2.5, 6], docError: 0.12, docFix: [3, 5, 8], receive: [1, 2, 4], workorder: [0.5, 1, 2],
    install: [2.5, 3.5, 5], burnin: [4, 6, 9], energize: [9, 12, 17], commission: [7, 10, 14],
    human: [1, 3, 7], rma: [8, 12, 20], invoice: [2, 5, 10], pay: [28, 32, 45],
  },
};

export const ASSUMPTIONS = [
  ['Planning run (BOM explode, need dates)', 'minutes, event-driven', '1–4 days, after a weekly planning cycle', 'modelled'],
  ['Supplier screen', 'Risk-provider re-screen in minutes, continuous', 'name check, 0.5–4 days; UBO only at onboarding', 'modelled'],
  ['RFQ → quote → award', 'A2A minutes; hosted agent hours; Envoy 1–3.5 days', '5–16 days (email, comparison, approval chain)', 'modelled'],
  ['PO → acknowledgement', 'minutes to 2.5 days by supplier tier', '1.5–8 days', 'modelled'],
  ['Customs entry', 'pre-filed, 0.2–1.2 days', '1–6 days; 12% need document fixes (+3–8)', 'modelled'],
  ['Receive & register serials', '1–6 hours (scan to ledger)', '1–4 days', 'modelled'],
  ['Install per lot (8 racks)', '2–3.5 days, kitted and sequenced', '2.5–5 days', 'modelled'],
  ['Burn-in & acceptance', '2–3.5 days, automated test plans', '4–9 days, manual sign-off', 'modelled'],
  ['Human decision latency', '2 hours – 1 day (exceptions only)', '1–7 days (every approval)', 'modelled'],
  ['Rack call-off', 'just-in-time: p80 lead + buffer before forecast hall-ready', 'as soon as possible', 'policy'],
  ['Manufacture, transit, construction', 'identical in both modes (common random numbers)', 'identical', 'illustrative'],
  ['Utility energisation dates', 'fixed per site (104 / 112 / 118)', 'same', 'illustrative'],
  ['Contract rate / rack cost', `$${PRICE_PER_GPU_HOUR}/GPU-hour · $${RACK_COST_M}M per 72-GPU rack`, 'same', 'illustrative'],
];

const tri = (r, [a, b, c]) => r.tri(a, b, c);
const mode3 = ([, b]) => b;
const p80 = ([, b, c]) => b + 0.55 * (c - b);

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (lt(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && lt(a[l], a[m])) m = l;
        if (r < a.length && lt(a[r], a[m])) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
const lt = (x, y) => x.t < y.t || (x.t === y.t && x.s < y.s);

export class Sim {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {'native'|'legacy'} o.mode
   * @param {object} [o.scenario]  scenario object from scenarios.js (or null for baseline)
   * @param {boolean} [o.autoResolve] resolve human decisions with the recommended option after modelled latency
   * @param {'jit'|'asap'} [o.policy] native rack call-off policy
   * @param {'earned'|'dayone'} [o.autonomy] earned = desks act within mandate (L3); dayone = every PO step needs approval
   * @param {string|object} [o.provider] risk-provider registry id or entry; changes log labels only, never outcomes
   */
  constructor({ seed = 42, mode = 'native', scenario = null, autoResolve = true, policy = 'jit', autonomy = 'earned', buffer = 10, horizon = 240, provider = undefined } = {}) {
    Object.assign(this, { seed: seed >>> 0, mode, scenario, autoResolve, policy, autonomy, buffer, horizon });
    this.P = typeof provider === 'object' && provider ? provider : riskProvider(provider);
    this.A = ADMIN[mode];
    this.t = 0; this.seq = 0; this.q = new Heap();
    this.ledger = []; this.msgs = []; this.alerts = []; this.decisions = []; this.detections = [];
    this.msgCount = 0; this.msgFam = {}; this.deskCount = {}; this.deskLast = {};
    this.humanApprovals = 0;
    this.cost = { premium: 0, tariff: 0, expedite: 0 };
    this.exposure = 0; this.gates = []; this.hooks = { begin: [], complete: [], live: [], stock: [] };
    this.series = []; this.doneAt = null;
    this.sup = Object.fromEntries(SUPPLIERS.map(s => [s.id, { flag: null, note: '', hold: false, sanctioned: false, active: 0 }]));
    this._buildWorld();
    if (scenario) scenario.setup?.(this);
    for (let d = 0; d <= horizon; d++) this.at(d, () => this._tick(d));
  }

  // ---------- randomness & scheduling ----------
  rng(key) { return new Rng(hashSeed(`${this.seed}|${key}`)); }
  /** Physical draw: same in both modes for the same key. */
  phys(key, r3) { return tri(this.rng(`phys|${key}`), r3); }
  /** Administrative draw: keyed by mode. */
  adm(key, r3) { return tri(this.rng(`${this.mode}|${key}`), r3); }
  at(t, fn) { this.q.push({ t: Math.max(t, this.t), s: this.seq++, fn }); }
  after(dt, fn) { this.at(this.t + dt, fn); }
  hook(kind, fn) { this.hooks[kind].push(fn); }

  advanceTo(T) {
    T = Math.min(T, this.horizon + 1);
    while (this.q.size && this.q.peek().t <= T) { const ev = this.q.pop(); this.t = ev.t; ev.fn(); }
    this.t = Math.max(this.t, T);
  }
  /** Run until every rack is billable (plus a tail for invoices and payments) or the horizon. */
  runToEnd(tail = 45) {
    while (this.t < this.horizon && this.doneAt == null) this.advanceTo(Math.floor(this.t) + 1);
    if (this.doneAt != null) this.advanceTo(Math.min(this.horizon, Math.max(REPORT_DAY, this.doneAt + tail)));
    return this;
  }

  // ---------- world ----------
  _buildWorld() {
    this.sites = SITES.map(s => ({ ...s, hallCount: s.halls, energizedAt: null, workDone: null, utilityAt: s.energize, xfmr: null, halls: [] }));
    this.halls = []; this.lines = []; this.racks = [];
    for (const site of this.sites) {
      this._line('xfmr', site, null, null);
      for (let h = 0; h < site.hallCount; h++) {
        const hall = { id: `${site.id}-H${h + 1}`, site, idx: h, needBy: site.needBy[h], shellAt: null, cooledAt: null, readyAt: null, crewBusy: false, lots: [], pausedUntil: 0, pauses: [] };
        site.halls.push(hall); this.halls.push(hall);
        hall.build = this._line('build', site, hall, null);
        hall.cdu = this._line('cdu', site, hall, null);
        hall.swgr = this._line('swgr', site, hall, null);
        const nLots = site.racksPerHall / RACKS_PER_LOT;
        for (let i = 0; i < nLots; i++) {
          const lot = { i, hall, state: 'pending', rack: null, optics: null, switch: null, racks: [] };
          lot.rack = this._line('rack', site, hall, lot);
          lot.optics = this._line('optics', site, hall, lot);
          lot.switch = this._line('switch', site, hall, lot);
          for (let k = 0; k < RACKS_PER_LOT; k++) {
            const rk = { id: `${hall.id}-L${i + 1}-R${k + 1}`, lot, hall, receivedAt: null, liveAt: null };
            lot.racks.push(rk); this.racks.push(rk);
          }
          hall.lots.push(lot);
        }
      }
    }
    for (const l of this.lines) this.at(l.site.contractDay, () => this._begin(l, l.pipe[0]));
  }

  _line(kind, site, hall, lot) {
    const M = MATERIALS[kind];
    const id = kind + ':' + (lot ? `${hall.id}-L${lot.i + 1}` : hall ? hall.id : site.id);
    const l = { id, kind, M, site, hall, lot, supId: M.sup(site), pipe: kind === 'build' ? BUILD_PIPE : SHIP_PIPE,
      stage: null, state: 'idle', t0: 0, t1: 0, tok: 0, holds: new Set(), extra: {}, attempt: 0, value: M.value,
      hist: [], flags: [], stockAt: null, done: false };
    if (kind === 'xfmr') site.xfmr = l;
    this._route(l);
    this.lines.push(l);
    return l;
  }
  _route(l, opts = {}) {
    if (l.kind === 'build') { l.lane = null; return; }
    const s = supplier(l.supId);
    const sameSide = (['US', 'MX'].includes(s.cc)) === (l.site.id === 'TX1');
    let m = l.M.mode === 'air' ? 'air' : sameSide ? 'land' : l.kind === 'switch' ? 'air' : 'sea';
    if (opts.mode) m = opts.mode;
    const ln = lane(s, l.site, m, opts);
    l.lane = ln; l.mode = ln.mode; l.gateway = ln.gateway;
    l.out = measure(densify(ln.outbound));
    l.haul = measure(densify(ln.haul));
  }

  // ---------- ledger, messages, alerts ----------
  /** Risk-provider call text for the active provider: rc('screen_entity', 'X') or rc([[cap, args], …]). */
  rc(cap, args) { return Array.isArray(cap) ? riskChain(this.P, cap) : riskCall(this.P, cap, args); }

  log(desk, text, o = {}) {
    if (this.mode === 'legacy') desk = LEGACY_ROLE[desk] || desk;
    const e = { t: this.t, desk, text, sev: o.sev || 'info', kind: o.kind || 'event', line: o.line?.id, sup: o.sup, site: o.site, human: !!o.human };
    this.ledger.push(e);
    this.deskCount[desk] = (this.deskCount[desk] || 0) + 1; this.deskLast[desk] = this.t;
    return e;
  }
  msg(fam, name, supId, dir, line, note = '') {
    const s = supplier(supId); if (!s) return;
    const ch = this.mode === 'legacy' ? 'email' : CONN[s.conn];
    const m = { t: this.t, fam, name, sup: supId, dir, ch, from: dir === 'out' ? [HQ.lon, HQ.lat] : [s.lon, s.lat], to: dir === 'out' ? [s.lon, s.lat] : [HQ.lon, HQ.lat] };
    this.msgs.push(m); if (this.msgs.length > 400) this.msgs.splice(0, this.msgs.length - 400);
    this.msgCount++; this.msgFam[fam] = (this.msgFam[fam] || 0) + 1;
    const who = dir === 'out' ? `→ ${s.name}` : `← ${s.name}`;
    const desk = this.mode === 'legacy' ? (dir === 'out' ? 'Buyer (email)' : 'Inbox') : s.conn === 'C' ? 'Envoy' : (FAM_DESK[fam] || 'Buyer');
    this.log(desk, `${name} ${who}${note ? ' · ' + note : ''} [${ch}]`, { kind: 'msg', sup: supId, line });
  }
  alert(o) { const a = { id: this.alerts.length + 1, t: this.t, until: this.t + (o.days ?? 6), sev: o.sev || 'risk', ...o }; this.alerts.push(a); return a; }
  detected(label, at) {
    const lag = this.t - at;
    this.detections.push({ label, at, detectedAt: this.t, lag });
    this.log(this.mode === 'legacy' ? 'Inbox' : 'Watchtower', `Detected: ${label} (${lag < 0 ? fmtLag(-lag) + ' before onset' : fmtLag(lag) + ' after onset'})`, { sev: 'warn', kind: 'risk' });
  }
  flag(supId, flag, note) { Object.assign(this.sup[supId], { flag, note }); }

  // ---------- decisions ----------
  /** Human decision. In native mode it appears in the cockpit queue; in legacy it is resolved after modelled committee latency. */
  decide({ title, desk, why, options, rec, block = [], sev = 'warn', latency }) {
    const d = { id: `D-${String(this.decisions.length + 1).padStart(3, '0')}`, t: this.t, title, desk, why, options, rec, block: block.map(l => l.id), sev, status: 'open', resolvedAt: null, choice: null, by: null };
    this.decisions.push(d);
    for (const l of block) this.hold(l, d.id);
    this.log(desk, `EscalateToHuman ${d.id}: ${title}`, { sev: 'human', kind: 'decision', human: false });
    if (this.mode === 'legacy' || this.autoResolve) {
      const lat = latency ?? this.adm(`human|${d.id}`, this.A.human);
      this.after(lat, () => d.status === 'open' && this.resolve(d.id, rec, this.mode === 'legacy' ? 'approval chain (modelled)' : 'auto: modelled human'));
    }
    return d;
  }
  resolve(id, optId, by = 'you') {
    const d = this.decisions.find(x => x.id === id);
    if (!d || d.status !== 'open') return false;
    const opt = d.options.find(o => o.id === optId) || d.options[0];
    Object.assign(d, { status: 'resolved', resolvedAt: this.t, choice: opt.id, by });
    this.log('Human', `${d.id} → ${opt.label} (${by}, ${fmtLag(this.t - d.t)})`, { sev: 'human', kind: 'decision', human: true });
    opt.effect?.(this);
    for (const lid of d.block) { const l = this.lines.find(x => x.id === lid); if (l) this.release(l, d.id); }
    return true;
  }

  // ---------- gates, holds, delays ----------
  gate(g) { const gg = { active: true, parked: [], ...g }; this.gates.push(gg); return gg; }
  openGate(id) {
    const g = this.gates.find(x => x.id === id && x.active); if (!g) return;
    g.active = false; const parked = g.parked.splice(0);
    for (const l of parked) this._begin(l, l.stage);
  }
  hold(l, why) { l.holds.add(why); }
  release(l, why) {
    l.holds.delete(why);
    if (!l.holds.size && l.state === 'held' && !l.heldBy && l.t1 <= this.t) this._complete(l, l.tok);
  }
  /** Push a stage later. Works whether the line is in the stage now or has not reached it yet. */
  extend(l, stage, days) {
    if (l.done) return false;
    const si = l.pipe.indexOf(stage), ci = l.pipe.indexOf(l.stage);
    if (si < 0 || (ci > si)) return false;
    if (ci === si && l.state === 'active') {
      l.t1 = Math.max(this.t, l.t1 + days); const tok = ++l.tok;
      this.at(l.t1, () => this._complete(l, tok));
    } else l.extra[stage] = (l.extra[stage] || 0) + days;
    return true;
  }
  /** Cancel and re-source a line that has not shipped. Returns true if switched. */
  resource(l, supId, why, { make } = {}) {
    if (!this.notShipped(l)) return false;
    if (make) l.make = make;
    const old = supplier(l.supId).name;
    l.supId = supId; l.attempt++; l.tok++; l.holds.clear(); l.extra = {}; l.heldBy = null;
    for (const g of this.gates) { const i = g.parked.indexOf(l); if (i >= 0) g.parked.splice(i, 1); }
    this._route(l);
    this.log('Buyer', `${l.M.label} ${short(l)} re-sourced ${old} → ${supplier(supId).name}${why ? ' · ' + why : ''}`, { sev: 'ok', line: l });
    this._begin(l, 'source');
    return true;
  }
  notShipped(l) { return !l.done && l.pipe.indexOf(l.stage) <= l.pipe.indexOf('make'); }
  /** Force a just-in-time line to call off now. */
  callOff(l, why) {
    if (l.stage !== 'release' || l.state !== 'waiting') return false;
    this.log('Planner', `Call-off pulled forward: ${l.M.label} ${short(l)}${why ? ' · ' + why : ''}`, { line: l });
    this._begin(l, 'screen');
    return true;
  }
  /** Detection lag: native is a fixed small number; legacy is drawn from a modelled range. */
  lag(key, native, legacy) { return this.mode === 'native' ? native : this.adm(`lag|${key}`, legacy); }
  setUtility(site, day, why) {
    site.utilityAt = day;
    if (why) this.log('Power Broker', `${site.name} energisation date → day ${Math.round(day)}: ${why}`, { sev: 'warn', site: site.id });
    this.at(day, () => this._powerCheck(site));
  }
  extendCooling(hall, days) {
    if (hall.cooledAt != null) return false;
    if (hall.coolStarted != null) { hall.coolEnd += days; const tok = ++hall.coolTok; this.at(hall.coolEnd, () => this._cooled(hall, tok)); }
    else hall.coolExtra = (hall.coolExtra || 0) + days;
    return true;
  }
  /** Re-route a line before it ships (e.g. via the Cape). */
  reroute(l, opts) { if (['ship', 'clear', 'haul', 'receive', 'stock'].includes(l.stage)) return false; this._route(l, opts); return true; }

  // ---------- durations ----------
  _dur(l, stage) {
    const A = this.A, k = `${l.id}|${stage}|${l.attempt}`, s = supplier(l.supId);
    const approval = () => (this.mode === 'native' && this.autonomy === 'dayone') ? (this.humanApprovals++, this.adm(`appr|${k}`, ADMIN.native.human)) : 0;
    switch (stage) {
      case 'plan': return this.adm(k, A.plan) + (this.mode === 'legacy' ? this.rng(`legacy|cycle|${l.id}`).float(0, A.planCycle) : 0);
      case 'release': return 0;
      case 'screen': return this.adm(k, A.screen) + approval();
      case 'source': return this.adm(k, A.source[s.conn]) + approval();
      case 'order': return this.adm(k, A.order[s.conn]) + approval();
      case 'make': return this.phys(`${l.id}|make|${l.supId}`, l.make || l.M.make);
      case 'build': return this.phys(`${l.id}|build`, [72, 84, 100]) + l.hall.idx * 10;
      case 'ship': return transitDays(this, l, l.out.km, `${l.id}|ship|${l.supId}`);
      case 'clear': {
        if (!l.gateway) return 0.05;
        let d = this.adm(k, A.clear);
        if (this.mode === 'legacy' && this.rng(`legacy|doc|${k}`).chance(A.docError)) d += this.adm(`${k}|fix`, A.docFix);
        return d;
      }
      case 'haul': return l.haul.km / 700 + this.phys(`${l.id}|haul`, [0.3, 0.6, 1.2]);
      case 'receive': return this.adm(k, A.receive);
      default: return 0;
    }
  }
  /** Expected remaining days for a line to reach stock (mode estimate; used by the planner). */
  eta(l) {
    if (l.stockAt != null) return l.stockAt;
    const A = this.A, s = supplier(l.supId);
    const ci = Math.max(0, l.pipe.indexOf(l.stage));
    let t = l.state === 'active' ? Math.max(this.t, l.t1) : this.t;
    for (let i = ci + (l.state === 'active' ? 1 : 0); i < l.pipe.length; i++) {
      const st = l.pipe[i];
      t += (l.extra[st] || 0);
      t += st === 'screen' ? mode3(A.screen) : st === 'source' ? mode3(A.source[s.conn]) : st === 'order' ? mode3(A.order[s.conn])
        : st === 'make' ? mode3(l.make || l.M.make) : st === 'build' ? 84 + l.hall.idx * 10 : st === 'ship' ? l.out.km / (l.mode === 'air' ? 9000 : l.mode === 'sea' ? 650 : 700) + (l.mode === 'air' ? 4.5 : l.mode === 'sea' ? 4 : 1)
          : st === 'clear' ? mode3(A.clear) : st === 'haul' ? l.haul.km / 700 + 0.6 : st === 'receive' ? mode3(A.receive) : 0;
    }
    return t;
  }
  /** p80 lead time from release to stock, used for just-in-time call-off. */
  leadP80(l) {
    const A = this.A, s = supplier(l.supId);
    return p80(A.screen) + p80(A.source[s.conn]) + p80(A.order[s.conn]) + p80(l.make || l.M.make) + (l.extra.make || 0)
      + l.out.km / (l.mode === 'air' ? 9000 : l.mode === 'sea' ? 650 : 700) + (l.mode === 'air' ? 6 : l.mode === 'sea' ? 6 : 2)
      + p80(A.clear) + l.haul.km / 700 + 1 + p80(A.receive) + (l.leadBias || 0);
  }
  forecastReady(hall) {
    const site = hall.site, A = this.A;
    const shell = hall.shellAt ?? this.eta(hall.build);
    const power = site.energizedAt ?? Math.max(site.utilityAt, Math.max(this.eta(site.xfmr), ...site.halls.map(h => this.eta(h.swgr))) + mode3(A.energize));
    const cool = hall.cooledAt ?? Math.max(shell, this.eta(hall.cdu)) + mode3(A.commission);
    return Math.max(shell, power, cool);
  }

  // ---------- line state machine ----------
  _begin(l, stage) {
    l.heldBy = null;
    for (const g of this.gates) {
      if (g.active && g.stage === stage && g.match(l)) {
        Object.assign(l, { stage, state: 'held', heldBy: g.id, t0: this.t, t1: this.t });
        g.parked.push(l);
        this.log(g.desk || 'Customs', `${l.M.label} ${short(l)} held before ${stage}: ${g.label}`, { sev: 'warn', line: l });
        return;
      }
    }
    if (stage === 'release' && this._waitsForCallOff(l)) { Object.assign(l, { stage, state: 'waiting', t0: this.t, t1: this.t }); return; }
    const d = Math.max(0, this._dur(l, stage) + (l.extra[stage] || 0));
    delete l.extra[stage];
    Object.assign(l, { stage, state: 'active', t0: this.t, t1: this.t + d });
    l.hist.push([stage, this.t]);
    const tok = ++l.tok;
    this._onBegin(l, stage);
    for (const h of this.hooks.begin) h(this, l, stage);
    this.at(l.t1, () => this._complete(l, tok));
  }
  _complete(l, tok) {
    if (tok !== l.tok || l.done) return;
    if (l.holds.size) { l.state = 'held'; return; }
    const stage = l.stage;
    this._onComplete(l, stage);
    for (const h of this.hooks.complete) h(this, l, stage);
    const nx = l.pipe[l.pipe.indexOf(stage) + 1];
    if (nx && nx !== 'stock') this._begin(l, nx);
    else {
      Object.assign(l, { stage: nx || stage, state: 'done', done: true, stockAt: this.t });
      this._arrived(l);
    }
  }
  _waitsForCallOff(l) {
    return this.mode === 'native' && this.policy === 'jit' && l.M.jit && !this._dueForRelease(l);
  }
  _dueForRelease(l) {
    return this.t >= this.forecastReady(l.hall) - this.leadP80(l) - this.buffer;
  }

  _onBegin(l, stage) {
    const s = supplier(l.supId), nat = this.mode === 'native';
    switch (stage) {
      case 'plan': if (l.kind === 'rack' && l.lot.i === 0 && l.hall.idx === 0) this.log('Planner', `Contract ${l.site.contract} signed → ${l.site.hallCount * l.site.racksPerHall} racks · ${(l.site.hallCount * l.site.racksPerHall * GPUS_PER_RACK).toLocaleString('en-US')} GPUs at ${l.site.name}; need-by day ${l.site.needBy.join(' / ')}`, { sev: 'ok', site: l.site.id }); break;
      case 'screen':
        if (nat) this.log('Screener', `${this.rc([['search_entities', `"${s.name}", ${s.cc}`], ['get_entity', 'id'], ['get_supplier_network', 'depth 3']])}: ${this.sup[l.supId].sanctioned ? 'MATCH' : 'clear'} (simulated)`, { sup: l.supId, line: l });
        else this.log('Compliance', `Name check of ${s.name} against list export (manual)`, { sup: l.supId, line: l });
        break;
      case 'source': this.msg('Sourcing', 'RFQ', l.supId, 'out', l, `${l.M.label} ${short(l)}`); this.after((l.t1 - this.t) * 0.6, () => l.stage === 'source' && this.msg('Sourcing', 'Quote', l.supId, 'in', l)); break;
      case 'order': {
        this.msg('Ordering', 'PurchaseOrder', l.supId, 'out', l, `$${l.value.toFixed(1)}M`);
        if (this.sup[l.supId].sanctioned) { this.exposure++; this.log('Auditor', `Commitment to ${s.name} after designation in its ownership chain`, { sev: 'risk', sup: l.supId }); }
        break;
      }
      case 'make': this.msg('Ordering', 'POAck', l.supId, 'in', l); this.after((l.t1 - this.t) * 0.5, () => l.stage === 'make' && this.msg('Collaboration', 'CommitUpdate', l.supId, 'in', l, `ship ≈ day ${Math.round(l.t1)}`)); break;
      case 'build': this.msg('Ordering', 'NoticeToProceed', l.supId, 'out', l, l.hall.id); break;
      case 'ship': this.msg('Logistics', 'ASN', l.supId, 'in', l, `${l.mode} via ${l.gateway || 'road'}`); this.sup[l.supId].active++; break;
      case 'clear': if (l.gateway) this.log('Customs', `${nat ? 'Pre-filed entry' : 'Entry filed'} at ${l.gateway} for ${l.M.label} ${short(l)}`, { line: l }); break;
      case 'receive': this.msg('Logistics', 'ProofOfDelivery', 'CAR', 'in', l, `${l.site.name}`); break;
    }
  }
  _onComplete(l, stage) {
    const s = supplier(l.supId);
    if (stage === 'source') {
      this.msg('Sourcing', 'Award', l.supId, 'out', l);
      if (this.mode === 'native' && l.value >= 2 && !l.awardChecked) {
        l.awardChecked = true;
        const r = this.rng(`phys|${l.id}|quote|${l.attempt}`);
        if (r.chance(0.14)) {
          const over = r.float(5.5, 11).toFixed(1);
          this.decide({ title: `Award ${l.M.label} ${short(l)} at +${over}% vs should-cost (mandate +5%)`, desk: 'Negotiator', why: `Best quote from ${s.name} exceeds the Negotiator mandate; alternates are slower.`, rec: 'approve', block: [l],
            options: [{ id: 'approve', label: 'Approve award', effect: sim => { sim.cost.premium += l.value * (over / 100 - 0.05); } },
              { id: 'counter', label: 'Counter at +5%', effect: sim => sim.extend(l, 'order', sim.phys(`${l.id}|counter`, [1, 1.5, 3])) }] });
        }
      }
    }
    if (stage === 'ship') this.sup[l.supId].active = Math.max(0, this.sup[l.supId].active - 1);
    if (stage === 'build') { l.hall.shellAt = this.t; this.log('Project Controller', `${l.hall.id} shell & fit-out complete (${s.name})`, { sev: 'ok', site: l.site.id }); this._checkHall(l.hall); }
  }
  _arrived(l) {
    if (l.kind === 'build') return;
    this.log('Registrar', `${l.M.label} ${short(l)} received at ${l.site.name}: serials → ledger, passports opened`, { sev: 'ok', line: l, site: l.site.id });
    if (l.kind === 'rack') for (const rk of l.lot.racks) rk.receivedAt = this.t;
    // finance tail
    this.after(this.adm(`${l.id}|inv`, this.A.invoice), () => {
      this.msg('Finance', 'Invoice', l.supId, 'in', l);
      this.after(this.adm(`${l.id}|pay`, this.A.pay), () => {
        if (this.sup[l.supId].hold) { this.log('Payables', `Payment to ${supplier(l.supId).name} held (compliance)`, { sev: 'warn', sup: l.supId }); return; }
        if (this.sup[l.supId].sanctioned) { this.exposure++; this.log('Auditor', `Payment released to ${supplier(l.supId).name} after designation in its ownership chain`, { sev: 'risk', sup: l.supId }); }
        this.msg('Finance', 'PaymentAdvice', l.supId, 'out', l);
      });
    });
    for (const h of this.hooks.stock) h(this, l);
    if (l.kind === 'xfmr' || l.kind === 'swgr') this._checkPower(l.site);
    if (l.kind === 'cdu') this._checkHall(l.hall);
    if (l.lot) this._tryInstall(l.hall);
  }

  // ---------- site build-out ----------
  _checkPower(site) {
    if (site.workStarted) return;
    if (site.xfmr.stockAt == null || site.halls.some(h => h.swgr.stockAt == null)) return;
    site.workStarted = this.t;
    const d = this.adm(`${site.id}|energize`, this.A.energize) * (site.labour || 1);
    this.log('Commissioner', `${site.name}: transformer + switchgear set, energisation tests start (${d.toFixed(0)} d)`, { site: site.id });
    this.after(d, () => { site.workDone = this.t; this._powerCheck(site); });
  }
  _powerCheck(site) {
    if (site.energizedAt != null || site.workDone == null) return;
    if (this.t + 1e-9 < site.utilityAt) { this.at(site.utilityAt, () => this._powerCheck(site)); return; }
    site.energizedAt = this.t;
    this.log('Power Broker', `${site.name} energised${site.interim ? ' on interim generation' : ''}`, { sev: 'ok', site: site.id });
    for (const h of site.halls) this._checkHall(h);
  }
  _checkHall(hall) {
    if (hall.cooledAt == null && !hall.coolStarted && hall.shellAt != null && hall.cdu.stockAt != null) {
      hall.coolStarted = this.t;
      hall.coolEnd = this.t + this.adm(`${hall.id}|commission`, this.A.commission) + (hall.coolExtra || 0);
      const tok = hall.coolTok = 1;
      this.at(hall.coolEnd, () => this._cooled(hall, tok));
    }
    if (hall.readyAt == null && hall.shellAt != null && hall.cooledAt != null && hall.site.energizedAt != null) {
      hall.readyAt = this.t;
      this.log('Deployer', `${hall.id} READY for racks (need-by day ${hall.needBy})`, { sev: 'ok', site: hall.site.id });
      this._tryInstall(hall);
    }
  }
  _cooled(hall, tok) {
    if (tok !== hall.coolTok || hall.cooledAt != null) return;
    hall.cooledAt = this.t;
    this.log('Commissioner', `${hall.id} liquid cooling commissioned`, { sev: 'ok', site: hall.site.id });
    this._checkHall(hall);
  }
  _tryInstall(hall) {
    if (hall.readyAt == null || hall.crewBusy) return;
    const lot = hall.lots.find(x => x.state === 'pending' && x.rack.done && x.optics.done && x.switch.done && !x.rack.quarantine);
    if (!lot) return;
    hall.crewBusy = true; lot.state = 'installing';
    const d = this.adm(`${hall.id}|L${lot.i}|wo`, this.A.workorder) + this.adm(`${hall.id}|L${lot.i}|install`, this.A.install);
    this.log('Deployer', `Install ${hall.id} lot ${lot.i + 1}: 8 racks, optics, leaf switches (${d.toFixed(1)} d)`, { site: hall.site.id });
    this.after(d, () => {
      hall.crewBusy = false; lot.state = 'burnin';
      this._tryInstall(hall);
      const b = this.adm(`${hall.id}|L${lot.i}|burnin`, this.A.burnin) + (lot.burnExtra || 0);
      this.after(b, () => this._accept(lot));
    });
  }
  _accept(lot) {
    const hall = lot.hall;
    const r = this.rng(`phys|${hall.id}|L${lot.i}|doa`);
    const doa = r.chance(0.22) ? 1 : 0;
    const failed = new Set();
    if (doa) failed.add(r.int(0, RACKS_PER_LOT - 1));
    const custom = new Map((lot.damaged || []).map(x => [x.k, x]));
    for (const k of custom.keys()) failed.add(k);
    lot.racks.forEach((rk, k) => { if (!failed.has(k)) this._live(rk); });
    lot.state = 'live';
    this.log('Commissioner', `${hall.id} lot ${lot.i + 1} accepted: ${RACKS_PER_LOT - failed.size}/8 racks billable`, { sev: 'ok', site: hall.site.id });
    for (const k of failed) {
      const rk = lot.racks[k];
      const c = custom.get(k);
      const d = c ? c.days : this.adm(`${rk.id}|rma`, this.A.rma);
      this.log('Returns', `${rk.id} ${c ? c.why : 'failed acceptance'} → ${c ? 'replacement' : this.mode === 'native' ? 'swap from site spares' : 'RMA to ODM'} (${d.toFixed(0)} d)`, { sev: 'warn', site: hall.site.id });
      this.after(d, () => this._live(rk));
    }
  }
  _live(rk) {
    rk.liveAt = this.t;
    for (const h of this.hooks.live) h(this, rk);
  }
  /** Take a hall's live racks out of billing for `days`. */
  pause(hall, days, why) {
    const from = Math.max(this.t, hall.pausedUntil);
    hall.pauses.push([this.t, this.t + days]);
    hall.pausedUntil = Math.max(hall.pausedUntil, this.t + days);
    this.log('Deployer', `${hall.id} billing paused ${days.toFixed(0)} d: ${why}`, { sev: 'risk', site: hall.site.id });
    return from;
  }

  _tick(d) {
    // planner call-off sweep
    if (this.mode === 'native') {
      for (const l of this.lines) if (l.stage === 'release' && l.state === 'waiting' && (this.policy !== 'jit' || this._dueForRelease(l))) {
        this.log('Planner', `Call-off ${l.M.label} ${short(l)}: forecast ${l.hall.id} ready ≈ day ${Math.round(this.forecastReady(l.hall))}, p80 lead ${Math.round(this.leadP80(l))} d`, { line: l });
        this._begin(l, 'screen');
      }
    }
    const live = this.racks.filter(r => r.liveAt != null && r.liveAt <= d);
    const billable = live.filter(r => !(r.hall.pausedUntil > d && r.hall.pauses.some(([a, b]) => d >= a && d < b))).length;
    const onDock = this.racks.filter(r => r.receivedAt != null && (r.liveAt == null || r.liveAt > d)).length;
    const transit = this.lines.filter(l => l.kind === 'rack' && ['ship', 'clear', 'haul'].includes(l.stage) && !l.done).length * RACKS_PER_LOT;
    this.series.push({ d, gpus: billable * GPUS_PER_RACK, live: live.length, onDock, transit });
    if (this.doneAt == null && live.length === this.racks.length) { this.doneAt = d; this.log('Conductor', `All ${this.racks.length} racks billable · ${(this.racks.length * GPUS_PER_RACK).toLocaleString('en-US')} GPUs`, { sev: 'ok' }); }
  }

  // ---------- read-outs ----------
  kpis(at = this.t) {
    const T = Math.min(at, this.horizon);
    const racks = this.racks;
    const live = racks.filter(r => r.liveAt != null && r.liveAt <= T);
    const first = live.length ? Math.min(...live.map(r => r.liveAt)) : null;
    const all = live.length === racks.length ? Math.max(...live.map(r => r.liveAt)) : null;
    const c2b = live.map(r => r.liveAt - r.hall.site.contractDay).sort((a, b) => a - b);
    const d2b = live.filter(r => r.receivedAt != null).map(r => r.liveAt - r.receivedAt).sort((a, b) => a - b);
    let late = 0, idle = 0, lostRev = 0, gpuDays = 0;
    for (const r of racks) {
      const end = r.liveAt != null && r.liveAt <= T ? r.liveAt : T;
      if (end > r.hall.needBy) late += end - Math.max(r.hall.needBy, 0);
      if (r.receivedAt != null && r.receivedAt <= T) idle += end - r.receivedAt;
      if (r.liveAt != null && r.liveAt <= T) {
        let days = T - r.liveAt;
        for (const [a, b] of r.hall.pauses) days -= Math.max(0, Math.min(b, T) - Math.max(a, r.liveAt));
        gpuDays += Math.max(0, days) * GPUS_PER_RACK;
      }
    }
    lostRev = late * GPUS_PER_RACK * 24 * PRICE_PER_GPU_HOUR / 1e6;
    const dec = this.decisions.filter(d => d.status === 'resolved');
    const decLat = dec.map(d => d.resolvedAt - d.t).sort((a, b) => a - b);
    return {
      t: T, gpusLive: live.length * GPUS_PER_RACK, gpusTotal: racks.length * GPUS_PER_RACK, racksLive: live.length, racksTotal: racks.length,
      firstLive: first, allLive: all, c2bMedian: median(c2b), d2bMedian: median(d2b),
      lateRackDays: late, idleRackDays: idle, idleCostM: idle * RACK_DEPRECIATION_DAY / 1e6,
      revenueM: gpuDays * 24 * PRICE_PER_GPU_HOUR / 1e6, lateRevenueM: lostRev,
      decisions: this.decisions.length, decisionsOpen: this.decisions.filter(d => d.status === 'open').length, decisionLatency: median(decLat),
      approvals: this.humanApprovals,
      agentActions: this.mode === 'native' ? this.ledger.filter(e => !e.human && e.t <= T).length : 0,
      humanTouches: this.mode === 'native' ? this.decisions.length + this.humanApprovals : this.ledger.filter(e => e.t <= T).length,
      messages: this.msgCount, exposure: this.exposure, premiumM: this.cost.premium, tariffM: this.cost.tariff, expediteM: this.cost.expedite,
      detection: this.detections.length ? Math.max(...this.detections.map(d => d.lag)) : null,
    };
  }
}

function transitDays(sim, l, km, key) {
  if (l.mode === 'air') return km / 9000 + sim.phys(key, [3, 4.5, 7]);
  if (l.mode === 'sea') return km / 650 + sim.phys(key, [2, 4, 7]);
  return km / 700 + sim.phys(key, [0.5, 1, 2]);
}
export const short = (l) => (l.lot ? `${l.hall.id}·L${l.lot.i + 1}` : l.hall ? l.hall.id : l.site.id);
export function median(a) { if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
export function fmtLag(d) { if (d < 0) return `${fmtLag(-d)} early`; return d < 1 / 24 ? `${Math.max(1, Math.round(d * 1440))} min` : d < 1 ? `${(d * 24).toFixed(d < 0.25 ? 1 : 0)} h` : `${d.toFixed(d < 10 ? 1 : 0)} d`; }

/** Convenience: run a whole scenario headless. */
export function runHeadless(opts) { return new Sim({ ...opts, autoResolve: true }).runToEnd(); }
