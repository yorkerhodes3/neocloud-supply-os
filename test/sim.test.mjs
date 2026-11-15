// Engine invariants for the agentic supply-chain simulation (docs/assets/js/sim).
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, ECONOMICS, validateEconomics, REPORT_DAY, PRICE_PER_GPU_HOUR } from '../docs/assets/js/sim/engine.js';
import { SCENARIOS, freshScenario } from '../docs/assets/js/sim/scenarios.js';
import { SITES, GPUS_PER_RACK, supplier } from '../docs/assets/js/sim/world.js';
import { runLatencyTrial, summarizeLatencyTrials } from '../docs/assets/js/sim/monte-carlo.js';
import {
  REGULATION_DEFAULTS, STUDENT_TEMPLATE, validateRegulation, validateStudentAnalysis,
  assessOptics, opticsFinding, regulationExposure, withRegulation,
} from '../docs/assets/js/sim/regulation.js';

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

test('cumulative revenue shortfall persists when the current daily revenue gap is zero', () => {
  const gap = day => baseline.native.kpis(day).revenueM - baseline.legacy.kpis(day).revenueM;
  assert.equal(gap(0), 0);
  const early = baseline.native.kpis().firstLive + 1;
  assert.ok(gap(early) > 0);
  assert.ok(gap(early + 1) > gap(early), 'shortfall grows while native earns and legacy does not');
  assert.equal(baseline.native.kpis(240).revenuePerDay - baseline.legacy.kpis(240).revenuePerDay, 0);
  assert.ok(gap(240) > 13 && gap(240) < 14, 'the completed baseline retains millions of foregone revenue, not $0');
  assert.ok(Math.abs(gap(240) - gap(200)) < 1e-9, 'same earning rates stop further accumulation; they do not recover missed revenue');
});

test('admin effort counts business tasks rather than ledger chatter or calendar waiting', () => {
  const legacy = baseline.legacy.kpis(), native = baseline.native.kpis();
  assert.ok(legacy.humanHours > native.humanHours && native.humanHours > 0);
  const s = run(0, 'legacy');
  const before = s.kpis();
  s.log('Inbox', 'Extra rendering/audit detail, not another task');
  s.coordination('extra-calendar-probe', 'human');
  assert.equal(s.kpis().humanHours, before.humanHours);
  assert.equal(s.kpis().humanTasks, before.humanTasks);
  assert.ok(run(0, 'native', { autonomy: 'dayone' }).kpis().humanHours > native.humanHours, 'day-one reserved approvals consume internal effort');
  const manual = new Sim({ autoResolve: false });
  const decision = manual.decide({ title: 'Review explicitly', desk: 'Conductor', options: [{ id: 'approve', label: 'Approve' }], rec: 'approve' });
  manual.advanceTo(20);
  assert.equal(manual.kpis().humanHours, 0, '20 days pending is not 480 hours of paid work');
  manual.resolve(decision.id, 'approve', 'you');
  assert.equal(manual.kpis().humanHours, 0.5, 'one resolved decision allocates 30 active minutes');
});

test('financing integrates successful cash outlays, allocating shared pre-live exposure per rack', () => {
  const s = new Sim();
  const line = s.lines.find(l => l.kind === 'rack');
  line.lot.racks.forEach((r, i) => { r.liveAt = i < 4 ? 20 : 40; });
  s.payments.push({ t: 10, line: line.id, amountM: 3.6525 });
  const rates = { ...ECONOMICS, capitalRate: 10 };
  assert.equal(s.kpis(9, rates).paidCapitalM, 0);
  assert.equal(s.kpis(10, rates).capitalCostM, 0, 'no time charge at the instant cash leaves');
  assert.ok(Math.abs(s.kpis(30, rates).capitalCostM - 0.02) < 1e-12);
  assert.ok(Math.abs(s.kpis(30, rates).preLiveCapitalCostM - 0.015) < 1e-12);
  assert.ok(Math.abs(s.kpis(50, rates).capitalCostM - 0.04) < 1e-12);
  assert.ok(Math.abs(s.kpis(50, rates).preLiveCapitalCostM - 0.02) < 1e-12, 'first-live ends pre-live exposure, not all financing');
});

test('payment holds and unpaid orders do not count as financed cash', () => {
  const s = new Sim({ scenario: { setup(sim) { sim.sup.OPT1.hold = true; } } });
  s.advanceTo(10);
  assert.ok(s.ledger.some(e => e.text.startsWith('PurchaseOrder')));
  assert.equal(s.kpis().paidCapitalM, 0);
  assert.equal(s.kpis().capitalCostM, 0);
  s.advanceTo(HORIZON);
  assert.ok(s.ledger.some(e => e.text.startsWith('Payment to Lumen Optics held')));
  assert.ok(s.payments.length > 0);
  assert.ok(s.payments.every(p => s.lines.find(l => l.id === p.line).kind !== 'optics'));
  const advices = s.ledger.filter(e => e.text.startsWith('PaymentAdvice '));
  assert.deepEqual(s.payments.map(p => [p.line, p.t]), advices.map(e => [e.line, e.t]));
  for (const payment of s.payments) assert.ok(payment.t > s.lines.find(l => l.id === payment.line).stockAt);
});

test('JIT reduces paid-capital exposure versus ASAP; rates change value, not schedules', () => {
  const jit = baseline.native.kpis(), asap = run(0, 'native', { policy: 'asap' }).kpis();
  assert.ok(Math.abs(jit.paidCapitalM - asap.paidCapitalM) < 1e-9, 'compare the same paid material scope');
  assert.ok(jit.capitalCostM < asap.capitalCostM);
  assert.ok(jit.preLiveCapitalCostM < asap.preLiveCapitalCostM);
  const doubled = baseline.native.kpis(HORIZON, { labourRate: ECONOMICS.labourRate * 2, capitalRate: ECONOMICS.capitalRate * 2 });
  assert.equal(doubled.labourCost, jit.labourCost * 2);
  assert.equal(doubled.capitalCostM, jit.capitalCostM * 2);
  assert.equal(doubled.revenueM, jit.revenueM);
  assert.equal(doubled.allLive, jit.allLive);
  const zero = baseline.native.kpis(HORIZON, { labourRate: 0, capitalRate: 0 });
  assert.equal(zero.labourCost, 0);
  assert.equal(zero.capitalCostM, 0);
  assert.equal(zero.humanHours, jit.humanHours);
  assert.equal(zero.paidCapitalM, jit.paidCapitalM);
  for (const bad of [{ labourRate: -1 }, { labourRate: '75' }, { capitalRate: NaN }, { capitalRate: 101 }]) {
    assert.throws(() => validateEconomics({ ...ECONOMICS, ...bad }));
  }
});

test('historical effort and financing read-outs do not leak future tasks or payments', () => {
  for (const mode of ['native', 'legacy']) for (const day of [10, 90, 160]) {
    const partial = new Sim({ mode, scenario: freshScenario(0) });
    partial.advanceTo(day);
    const historical = baseline[mode].kpis(day), current = partial.kpis();
    for (const key of ['humanTasks', 'humanHours', 'labourCost', 'paidCapitalM', 'capitalCostM', 'preLiveCapitalCostM']) {
      assert.equal(historical[key], current[key], `${mode}: future data leaked into ${key}`);
    }
    if (day === 10) assert.ok(historical.humanHours < baseline[mode].kpis().humanHours);
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
  assert.deepEqual(b.effort, a.effort);
  assert.deepEqual(b.payments, a.payments);
  assert.equal(b.kpis().labourCost, a.kpis().labourCost);
  assert.equal(b.kpis().capitalCostM, a.kpis().capitalCostM);
});

const regulationRun = (mode = 'native', config = REGULATION_DEFAULTS, analysis = null, n = 0) => {
  const s = new Sim({ seed: 42, mode, scenario: withRegulation(freshScenario(n), config, analysis), autoResolve: true });
  s.advanceTo(HORIZON);
  return s;
};

test('coordination trials retain the proposed-regulation branch and local evidence assumptions', () => {
  const regulation = { ...REGULATION_DEFAULTS, qualificationDays: 90 };
  const trial = runLatencyTrial({ trial: 3, regulation });
  const without = runLatencyTrial({ trial: 3 });
  assert.notEqual(trial.native.allLive, without.native.allLive, 'coordination bands must not silently omit the overlay');
  for (const mode of ['native', 'legacy']) {
    const sim = new Sim({
      seed: 42, latencySeed: trial.latencySeed, mode,
      scenario: withRegulation(freshScenario(0), regulation),
    });
    sim.advanceTo(HORIZON);
    assert.equal(trial[mode].allLive, sim.kpis(HORIZON).allLive);
    assert.equal(trial[mode].revenueM, sim.kpis(REPORT_DAY).revenueM);
    assert.deepEqual(trial[mode].series, sim.series);
  }
  const analysis = validateStudentAnalysis({
    ...STUDENT_TEMPLATE, parts: [{ ...STUDENT_TEMPLATE.parts[0], authorization: 'existing' }],
  });
  assert.deepEqual(runLatencyTrial({ trial: 3, regulation, analysis }), without, 'an authorized-model finding should remove proposal exposure from the ensemble');
});

test('proposed regulation is an isolated deterministic overlay, not a changed baseline', () => {
  assert.equal(withRegulation(null, null), null);
  const unmodified = new Sim({ seed: 42, mode: 'native', scenario: withRegulation(freshScenario(0), null) });
  unmodified.advanceTo(HORIZON);
  assert.equal(fingerprint(unmodified), fingerprint(baseline.native));
  for (const mode of ['native', 'legacy']) {
    const s = regulationRun(mode);
    assert.equal(fingerprint(s), fingerprint(regulationRun(mode)));
    assert.ok(s.ledger.some(e => e.text.includes('ProposedRegulationInjected') && e.text.includes('SIMULATION ONLY')));
    assert.ok(s.cost.premium > baseline[mode].cost.premium);
    assert.equal(s.exposure, 0, 'a proposal is not a sanctions designation');
    assert.equal(s.decisions.filter(d => d.status === 'open').length, 0);
  }
});

test('optics scope follows generation, authorization and manufacturing evidence, not distributor country', () => {
  const config = validateRegulation(REGULATION_DEFAULTS);
  const p = opticsFinding(config, 'TX1');
  assert.equal(assessOptics(config, p).status, 'affected');
  assert.equal(assessOptics(config, { ...p, siteId: 'NO1' }).status, 'out-of-scope');
  assert.equal(assessOptics(config, { ...p, generation: '800G' }).status, 'out-of-scope');
  assert.equal(assessOptics(config, { ...p, authorization: 'existing' }).status, 'exempt');
  assert.equal(assessOptics(config, { ...p, originCountry: 'US' }).status, 'out-of-scope');
  assert.equal(assessOptics(config, { ...p, originCountry: 'unknown' }).status, 'unknown');
  assert.equal(assessOptics(config, { ...p, authorization: 'unknown' }).status, 'unknown');
  assert.equal(assessOptics(config, { ...p, usBomPct: null }).status, 'unknown');
  assert.equal(assessOptics({ ...config, exemptionPct: null }, { ...p, usBomPct: null }).status, 'affected');
  assert.equal(assessOptics(config, { ...p, usBomPct: 64.9 }).status, 'affected');
  assert.equal(assessOptics(config, { ...p, usBomPct: 65 }).status, 'exempt');
  assert.equal(assessOptics(config, { ...p, usBomPct: 100 }).status, 'exempt');
  const exposure = regulationExposure(baseline.native, config);
  assert.equal(exposure.counts.affected, 8);
  assert.equal(exposure.counts['out-of-scope'], 8);
  assert.equal(exposure.gpus, 4608);
  assert.ok(Math.abs(exposure.valueM - 8.8) < 1e-9);
});

test('an earlier-generation or authorized-model finding does not delay or reprice the baseline', () => {
  const cases = [
    { config: { ...REGULATION_DEFAULTS, generation: '800G' }, analysis: null },
    { config: REGULATION_DEFAULTS, analysis: validateStudentAnalysis({
      ...STUDENT_TEMPLATE, parts: [{ ...STUDENT_TEMPLATE.parts[0], authorization: 'existing' }],
    }) },
    { config: REGULATION_DEFAULTS, analysis: validateStudentAnalysis({
      ...STUDENT_TEMPLATE, parts: [{ ...STUDENT_TEMPLATE.parts[0], usBomPct: 65 }],
    }) },
  ];
  for (const { config, analysis } of cases) for (const mode of ['native', 'legacy']) {
    const s = regulationRun(mode, config, analysis);
    assert.equal(s.kpis(HORIZON).allLive, baseline[mode].kpis(HORIZON).allLive);
    assert.equal(s.cost.premium, baseline[mode].cost.premium);
    assert.ok(!s.decisions.some(d => d.desk === 'Resilience'));
    assert.equal(baseline[mode].lines.find(l => l.kind === 'optics').M.unit, '1,152 × 800G transceivers');
  }
});

test('student findings retain evidence; a partial import exposes unknown sites instead of using fixtures', () => {
  const analysis = validateStudentAnalysis(STUDENT_TEMPLATE);
  assert.deepEqual(analysis, STUDENT_TEMPLATE);
  const config = { ...REGULATION_DEFAULTS, scope: 'all', status: 'hypothetical' };
  const exposure = regulationExposure(baseline.native, config, analysis);
  assert.equal(exposure.counts.affected, 8);
  assert.equal(exposure.counts.unknown, 8);
  assert.equal(exposure.gpus, 9216);
  assert.equal(opticsFinding(config, 'NO1', analysis).manufacturer, 'Unknown');
  assert.equal(analysis.parts[0].provider, 'sayari');
  assert.equal(analysis.parts[0].relationship, STUDENT_TEMPLATE.parts[0].relationship);
});

test('invalid rule and student input is explicitly rejected', () => {
  for (const bad of [
    { effectiveDay: 19 }, { exemptionPct: 101 }, { qualificationDays: 0 },
    { status: 'enacted' }, { generation: '6.4T' }, { startDate: '2028-02-30' },
    { scope: 'all' }, { signalDay: NaN }, { version: 2 },
  ]) assert.throws(() => validateRegulation({ ...REGULATION_DEFAULTS, ...bad }));
  for (const changes of [
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@example.com' },
    { usBomPct: '65' }, { authorization: 'clear' }, { entityId: '' }, { siteId: 'UNKNOWN' },
  ]) assert.throws(() => validateStudentAnalysis({
    ...STUDENT_TEMPLATE, parts: [{ ...STUDENT_TEMPLATE.parts[0], ...changes }],
  }));
  assert.throws(() => validateStudentAnalysis({ ...STUDENT_TEMPLATE, parts: [...STUDENT_TEMPLATE.parts, ...STUDENT_TEMPLATE.parts] }), /Duplicate/);
  assert.throws(() => validateStudentAnalysis({ ...STUDENT_TEMPLATE, asOf: '2026-02-30' }), /as-of/);
});

test('waiting enforces only the assumed new-model shipment boundary, while redesign restores delivery', () => {
  const s = new Sim({ seed: 42, mode: 'native', scenario: withRegulation(freshScenario(0), REGULATION_DEFAULTS), autoResolve: true });
  s.advanceTo(20.11);
  const decision = s.decisions.find(d => d.desk === 'Resilience');
  assert.ok(decision && decision.status === 'open');
  assert.ok(s.resolve(decision.id, 'wait', 'you'));
  s.advanceTo(HORIZON);
  const gate = s.gates.find(g => g.id === 'PROPOSED-REGULATION');
  assert.ok(gate.active && gate.parked.length > 0);
  for (const line of gate.parked) {
    assert.equal(line.site.id, 'TX1');
    assert.equal(line.stage, 'ship');
    assert.ok(line.t0 >= REGULATION_DEFAULTS.effectiveDay);
  }
  assert.ok(s.kpis(HORIZON).gpusLive < baseline.native.kpis(HORIZON).gpusLive);
  assert.equal(regulationRun().kpis(HORIZON).gpusLive, 9216);
});

test('late mitigation releases optics already parked at the proposal gate', () => {
  const config = { ...REGULATION_DEFAULTS, signalDay: 0, effectiveDay: 0 };
  const base = { setup(s) {
    for (const l of s.lines.filter(l => l.kind === 'optics' && l.site.id === 'TX1')) l.pipe = ['ship', 'stock'];
  } };
  const s = new Sim({ seed: 42, scenario: withRegulation(base, config), autoResolve: true });
  s.advanceTo(0.11);
  assert.equal(s.gates.find(g => g.id === 'PROPOSED-REGULATION').parked.length, 8);
  s.advanceTo(100);
  const gate = s.gates.find(g => g.id === 'PROPOSED-REGULATION');
  assert.equal(gate.active, false);
  assert.equal(gate.parked.length, 0);
  assert.ok(s.lines.filter(l => l.kind === 'optics' && l.site.id === 'TX1').every(l => l.stockAt !== null));
});

test('regulation qualification never clears unrelated holds or gates', () => {
  let held;
  const base = { setup(s) {
    held = s.lines.find(l => l.kind === 'optics' && l.site.id === 'TX1');
    s.hold(held, 'OTHER-DECISION');
    s.gate({ id: 'OTHER-GATE', stage: 'order', label: 'unrelated review', match: l => l.kind === 'optics' && l.site.id === 'TX1' && l !== held });
  } };
  const s = new Sim({ seed: 42, scenario: withRegulation(base, REGULATION_DEFAULTS), autoResolve: true });
  s.advanceTo(HORIZON);
  assert.ok(held.holds.has('OTHER-DECISION'));
  assert.ok(!held.holds.has('REGULATION-QUALIFICATION'));
  const gate = s.gates.find(g => g.id === 'OTHER-GATE');
  assert.ok(gate.active && gate.parked.length > 0);
  assert.ok(!s.gates.find(g => g.id === 'PROPOSED-REGULATION').active);
});

test('proposed regulation composes with every original playbook in both modes', () => {
  for (const sc of SCENARIOS) for (const mode of ['native', 'legacy']) {
    const s = regulationRun(mode, REGULATION_DEFAULTS, null, sc.n);
    assert.equal(s.t, HORIZON);
    assert.equal(s.racks.length, 128);
    assert.equal(s.decisions.filter(d => d.status === 'open').length, 0, `S${sc.n} ${mode}`);
    assert.ok(s.ledger.some(e => e.text.includes('ProposedRegulationInjected')), `S${sc.n} ${mode}`);
  }
});

test('manual proposal choice replays identically and already dispatched optics are not recalled', () => {
  const config = { ...REGULATION_DEFAULTS, signalDay: 90, effectiveDay: 100 };
  const make = () => new Sim({ seed: 42, mode: 'legacy', scenario: withRegulation(freshScenario(0), config), autoResolve: true });
  const s = make();
  s.advanceTo(100);
  assert.ok(s.lines.filter(l => l.kind === 'optics' && l.site.id === 'TX1').every(l => l.stockAt !== null));
  s.advanceTo(HORIZON);
  assert.equal(s.kpis(HORIZON).allLive, baseline.legacy.kpis(HORIZON).allLive);
  const mk = () => new Sim({ seed: 42, scenario: withRegulation(freshScenario(0), REGULATION_DEFAULTS), autoResolve: true });
  const a = mk();
  a.advanceTo(20.11);
  const d = a.decisions.find(d => d.desk === 'Resilience');
  a.resolve(d.id, 'wait', 'you');
  a.advanceTo(HORIZON);
  const b = mk();
  b.at(20.11, () => b.resolve(d.id, 'wait', 'you'));
  b.advanceTo(HORIZON);
  assert.equal(fingerprint(a), fingerprint(b));
});
