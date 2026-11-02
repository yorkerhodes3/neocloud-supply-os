// Engine invariants for the agentic supply-chain simulation (docs/assets/js/sim).
// Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, REPORT_DAY } from '../docs/assets/js/sim/engine.js';
import { SCENARIOS, freshScenario } from '../docs/assets/js/sim/scenarios.js';
import { SITES, GPUS_PER_RACK } from '../docs/assets/js/sim/world.js';

const HORIZON = 240;
const run = (n, mode, opts = {}) => {
  const s = new Sim({ seed: 42, mode, scenario: freshScenario(n), autoResolve: true, ...opts });
  s.advanceTo(HORIZON);
  return s;
};
const inf = (v) => (v == null ? Infinity : v);
const fingerprint = (s) => s.ledger.map((e) => `${e.t.toFixed(6)}|${e.text}`).join('\n');
const makeDurations = (s) => {
  const out = new Map();
  for (const l of s.lines) {
    const i = l.hist.findIndex(([st]) => st === 'make');
    if (i >= 0 && l.hist[i + 1]) out.set(l.id, l.hist[i + 1][1] - l.hist[i][1]);
  }
  return out;
};

const baseline = { native: run(0, 'native'), legacy: run(0, 'legacy') };

test('same seed, same run: the engine is deterministic', () => {
  for (const mode of ['native', 'legacy']) {
    const again = run(0, mode);
    assert.equal(fingerprint(again), fingerprint(baseline[mode]), `${mode} ledger differs between identical runs`);
  }
  const other = new Sim({ seed: 7, mode: 'native', scenario: freshScenario(0) });
  other.advanceTo(HORIZON);
  assert.notEqual(fingerprint(other), fingerprint(baseline.native), 'a different seed should give a different world');
});

test('racks are conserved: every planned rack exists exactly once', () => {
  const expected = SITES.reduce((a, s) => a + s.halls * s.racksPerHall, 0);
  for (const s of Object.values(baseline)) {
    assert.equal(s.racks.length, expected);
    assert.equal(new Set(s.racks.map((r) => r.id)).size, expected, 'duplicate rack ids');
    const k = s.kpis(HORIZON);
    assert.equal(k.gpusTotal, expected * GPUS_PER_RACK);
    assert.ok(k.racksLive <= k.racksTotal);
  }
});

test('baseline: every rack is billable by the horizon in both modes', () => {
  for (const [mode, s] of Object.entries(baseline)) {
    const k = s.kpis(HORIZON);
    assert.equal(k.racksLive, k.racksTotal, `${mode}: ${k.racksLive}/${k.racksTotal} racks live`);
    for (const r of s.racks) {
      assert.ok(r.liveAt != null && r.receivedAt != null && r.liveAt >= r.receivedAt, `${mode} ${r.id}: live before received`);
    }
  }
});

test('common random numbers: both modes face the same physical world', () => {
  const n = makeDurations(baseline.native), l = makeDurations(baseline.legacy);
  assert.ok(n.size > 20, 'expected manufacturing stages to compare');
  let compared = 0;
  for (const [id, d] of n) {
    if (!l.has(id)) continue;
    assert.ok(Math.abs(d - l.get(id)) < 1e-9, `${id}: make ${d} (native) vs ${l.get(id)} (legacy)`);
    compared++;
  }
  assert.ok(compared > 20, `only ${compared} lines compared`);
  assert.equal(baseline.native.phys('probe', [1, 2, 3]), baseline.legacy.phys('probe', [1, 2, 3]));
  assert.notEqual(baseline.native.adm('probe', [1, 2, 3]), baseline.legacy.adm('probe', [1, 2, 3]));
});

test('every scenario runs to the horizon in both modes and seeds', () => {
  assert.equal(SCENARIOS.length, 17);
  for (const seed of [42, 9]) {
    for (const sc of SCENARIOS) {
      for (const mode of ['native', 'legacy']) {
        const s = new Sim({ seed, mode, scenario: freshScenario(sc.n), autoResolve: true });
        assert.doesNotThrow(() => s.advanceTo(HORIZON), `S${sc.n} ${mode} seed ${seed}`);
        assert.ok(s.t >= HORIZON - 1e-9);
        assert.equal(s.decisions.filter((d) => d.status === 'open').length, 0, `S${sc.n} ${mode}: auto-resolve left decisions open`);
      }
    }
  }
});

test('agent-native reaches full capacity no later than legacy, in every scenario', () => {
  for (const sc of SCENARIOS) {
    const n = run(sc.n, 'native').kpis(HORIZON), l = run(sc.n, 'legacy').kpis(HORIZON);
    assert.ok(inf(n.allLive) <= inf(l.allLive), `S${sc.n}: native ${n.allLive} vs legacy ${l.allLive}`);
    assert.ok(n.humanTouches < l.humanTouches, `S${sc.n}: human touches`);
  }
});

test('S8 sanctions: agents never pay a designated party; the legacy model does', () => {
  const n = run(8, 'native'), l = run(8, 'legacy');
  assert.equal(n.exposure, 0);
  assert.ok(l.exposure > 0, 'legacy exposure should be > 0 in S8');
  for (const sc of SCENARIOS) assert.equal(run(sc.n, 'native').exposure, 0, `S${sc.n} native exposure`);
});

test('disruptions are detected faster by the agent-native run', () => {
  for (const sc of SCENARIOS.filter((s) => s.n > 0)) {
    const n = run(sc.n, 'native'), l = run(sc.n, 'legacy');
    if (!n.detections.length || !l.detections.length) continue;
    assert.ok(n.detections[0].lag <= l.detections[0].lag, `S${sc.n}: native lag ${n.detections[0].lag} vs legacy ${l.detections[0].lag}`);
  }
});

test('approving every step multiplies human work without moving the baseline schedule', () => {
  const earned = baseline.native.kpis(REPORT_DAY), dayone = run(0, 'native', { autonomy: 'dayone' }).kpis(REPORT_DAY);
  assert.equal(earned.approvals, 0);
  assert.ok(dayone.approvals > 50);
  assert.ok(dayone.humanTouches >= 10 * earned.humanTouches);
  assert.ok(Math.abs(inf(dayone.firstLive) - inf(earned.firstLive)) <= 2);
});

test('just-in-time call-off holds less idle capital than ASAP without delaying full capacity', () => {
  const jit = baseline.native.kpis(REPORT_DAY), asap = run(0, 'native', { policy: 'asap' }).kpis(REPORT_DAY);
  assert.ok(jit.idleCostM < asap.idleCostM, `idle $${jit.idleCostM}M vs $${asap.idleCostM}M`);
  assert.ok(inf(jit.allLive) <= inf(asap.allLive) + 1);
});

test('manual decisions replay identically after a rewind', () => {
  const mk = () => new Sim({ seed: 42, mode: 'native', scenario: freshScenario(4), autoResolve: false });
  const a = mk();
  a.advanceTo(3);
  const open = a.decisions.filter((d) => d.status === 'open');
  assert.ok(open.length > 0, 'S4 with auto-resolve off should open a decision early');
  const choice = { id: open[0].id, opt: open[0].rec, t: a.t };
  assert.ok(a.resolve(choice.id, choice.opt, 'you'));
  a.advanceTo(30);
  const b = mk();
  b.at(choice.t, () => b.resolve(choice.id, choice.opt, 'you'));
  b.advanceTo(30);
  assert.equal(fingerprint(b), fingerprint(a));
});
