// Engine invariants for the agentic supply-chain simulation (docs/assets/js/sim).
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, REPORT_DAY, PRICE_PER_GPU_HOUR } from '../docs/assets/js/sim/engine.js';
import { SCENARIOS, freshScenario } from '../docs/assets/js/sim/scenarios.js';
import { SITES, GPUS_PER_RACK, supplier } from '../docs/assets/js/sim/world.js';
import { runLatencyTrial, summarizeLatencyTrials } from '../docs/assets/js/sim/monte-carlo.js';

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

test('daily revenue follows the billable ramp rather than assuming a full fleet', () => {
  const s = baseline.native;
  assert.equal(s.kpis(0).revenuePerDay, 0);
  const t = s.kpis().firstLive + 0.01;
  const k = s.kpis(t);
  assert.ok(k.gpusBillable > 0 && k.gpusBillable < k.gpusTotal);
  const dt = 0.00001;
  const earnedPerDay = (s.kpis(t + dt).revenueM - k.revenueM) * 1e6 / dt;
  assert.ok(Math.abs(k.revenuePerDay - earnedPerDay) < 0.01, 'daily run-rate must agree with accrued GPU-hour revenue');
});

test('daily revenue excludes paused racks and recovers at the end of the pause', () => {
  const s = run(0, 'native');
  const hall = s.halls[0];
  const t = s.kpis().allLive + 1;
  hall.pauses.push([t, t + 2]);
  const full = s.kpis(t - 0.01);
  const paused = s.kpis(t);
  const recovered = s.kpis(t + 2);
  const hallGpus = hall.lots.reduce((sum, lot) => sum + lot.racks.length * GPUS_PER_RACK, 0);
  assert.equal(paused.gpusBillable, full.gpusBillable - hallGpus);
  assert.ok(Math.abs(paused.revenuePerDay - (full.revenuePerDay - hallGpus * 24 * PRICE_PER_GPU_HOUR)) < 1e-6);
  assert.equal(paused.gpusLive, full.gpusLive, 'a billing pause does not undo acceptance');
  assert.equal(recovered.revenuePerDay, full.revenuePerDay);
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

test('human coordination varies per task instance from same-day replies to multi-week waits', () => {
  const waits = baseline.legacy.latencies.filter(s => s.task === 'source');
  assert.ok(waits.length > 20, 'expected independent quote / award task instances');
  assert.ok(Math.min(...waits.map(s => s.days)) < 0.5, 'missing same-day responses');
  assert.ok(Math.max(...waits.map(s => s.days)) > 14, 'missing two-week-plus calendar waits');
  assert.equal(new Set(waits.map(s => s.days)).size, waits.length, 'task instances must not share a static delay');
  const crew = baseline.legacy.latencies.filter(s => s.task === 'workorder');
  assert.ok(Math.max(...crew.map(s => s.days)) - Math.min(...crew.map(s => s.days)) > 7, 'crew scheduling should not be a uniform offset');
});

test('changing only the latency seed resamples human timing without changing physical work', () => {
  const a = run(0, 'legacy', { latencySeed: 123 });
  const b = run(0, 'legacy', { latencySeed: 123 });
  assert.equal(fingerprint(a), fingerprint(b), 'latency-seeded runs must replay exactly');
  assert.notEqual(fingerprint(a), fingerprint(baseline.legacy), 'resampling latency should change the trajectory');
  const before = makeDurations(baseline.legacy), after = makeDurations(a);
  assert.ok(after.size > 20);
  for (const [id, days] of after) {
    if (before.has(id)) assert.ok(Math.abs(days - before.get(id)) < 1e-9, `${id}: latency seed changed manufacture duration`);
  }
  for (const key of ['make-probe', 'ship-probe', 'construction-probe', 'failure-probe']) {
    assert.equal(a.phys(key, [1, 2, 3]), baseline.legacy.phys(key, [1, 2, 3]));
  }
});

test('agents bypass automated coordination, not human suppliers or reserved approvals', () => {
  const automated = baseline.native.lines.find(l => l.kind === 'rack' && supplier(l.supId).conn === 'A');
  assert.ok(automated);
  assert.equal(baseline.native.latencies.filter(s => s.key.startsWith(`${automated.id}|`) && ['source', 'order'].includes(s.task)).length, 0);
  const envoyWaits = baseline.native.latencies.filter(s => s.task === 'source');
  assert.ok(envoyWaits.length > 0, 'Envoy must wait on human suppliers');
  for (const wait of envoyWaits) {
    const line = baseline.native.lines.find(l => wait.key.startsWith(`${l.id}|`));
    assert.equal(supplier(line.supId).conn, 'C');
  }
  const dayone = run(0, 'native', { autonomy: 'dayone' });
  const approvals = dayone.latencies.filter(s => s.task === 'human');
  assert.ok(approvals.length > 50);
  assert.ok(approvals.some(s => s.days > 14), 'native human approvals must also experience multi-week calendar waits');
  for (const [scenario, key] of [[5, 'uk1committee'], [15, 'no1committee']]) {
    const s = run(scenario, 'legacy');
    const wait = s.latencies.find(w => w.task === 'human' && w.key === key);
    assert.ok(wait, `S${scenario}: committee approval bypassed the human calendar model`);
    const decision = s.decisions.find(d => d.desk === 'Committee');
    const processing = decision.resolvedAt - decision.t - wait.days;
    assert.ok(processing >= s.A.human[0] - 1e-9 && processing <= s.A.human[2] + 1e-9);
  }
});

test('50 fixed-world Monte Carlo trials produce reproducible trajectory variance and retain censored runs', () => {
  const trials = Array.from({ length: 50 }, (_, trial) => runLatencyTrial({ trial }));
  const report = summarizeLatencyTrials(trials);
  assert.equal(report.runs, 50);
  assert.equal(new Set(report.trials.map(t => t.latencySeed)).size, 50);
  assert.deepEqual(runLatencyTrial({ trial: 7 }), trials[7]);
  assert.ok(report.modes.legacy.allLive.p90 - report.modes.legacy.allLive.p10 >= 14, 'full-capacity spread should reveal at least a two-week calendar effect');
  assert.ok(report.modes.legacy.firstLive.p90 - report.modes.legacy.firstLive.p10 >= 7);
  for (const mode of ['native', 'legacy']) {
    const series = report.modes[mode].series;
    assert.equal(series.length, HORIZON + 1);
    assert.equal(series[0].d, 0);
    assert.equal(series.at(-1).d, HORIZON);
    assert.ok(series.some(s => s.p90 - s.p10 >= 8 * GPUS_PER_RACK), `${mode}: expected a visible trajectory band`);
    for (const s of series) assert.ok(0 <= s.p10 && s.p10 <= s.p50 && s.p50 <= s.p90 && s.p90 <= baseline[mode].kpis().gpusTotal);
  }
  const censored = trials.map((t, i) => i < 10 ? { ...t, legacy: { ...t.legacy, allLive: null } } : t);
  const partial = summarizeLatencyTrials(censored);
  assert.equal(partial.modes.legacy.completed, 40);
  assert.equal(partial.modes.legacy.allLive.p90, null, 'dropping unfinished runs would incorrectly report a finite P90');
  assert.ok(Number.isFinite(partial.modes.legacy.allLive.p50));
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
