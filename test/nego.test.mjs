// Negotiation Room engine tests — node:test, built-ins only. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  instantiate, analyse, quickStats, paretoFrontier, nashPoint, acNext, targetUtility, mandateCheck,
  runNegotiation, monteCarlo, Negotiation, utilityOf, digitsAt, digitsFromOffer, STYLE_ORDER, GENERATOR,
} from '../docs/assets/js/nego/engine.js';
import { SCENARIOS } from '../docs/assets/js/nego/scenarios.js';
import { detectMove, detectText, RULES } from '../docs/assets/js/nego/detector.js';
import {
  parseNDJSON, toNDJSON, exportPerspective, tickGaps, displayNameFor, readinessFromRecords, fixMojibake,
} from '../docs/assets/js/nego/ndjson.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = join(ROOT, 'docs/assets/runs');
const IDS = Object.keys(SCENARIOS);

test('same scenario + seed + styles → byte-identical NDJSON', () => {
  for (const id of IDS) {
    const a = toNDJSON(runNegotiation(id, { seed: 7, style: 'linear', ours: 'boulware' }).records);
    const b = toNDJSON(runNegotiation(id, { seed: 7, style: 'linear', ours: 'boulware' }).records);
    assert.equal(a, b, `${id} not deterministic`);
    const c = toNDJSON(runNegotiation(id, { seed: 8, style: 'linear', ours: 'boulware' }).records);
    assert.notEqual(a, c, `${id}: different seed should change the run`);
  }
});

test('header marks synthetic output and the generator', () => {
  const recs = runNegotiation('odm-rack', { seed: 42 }).records;
  const h = recs[0];
  assert.equal(h.kind, 'header');
  assert.equal(h.payload.generator, GENERATOR);
  assert.equal(h.payload.generator, 'neocloud-supply-os/nego-engine');
  assert.equal(h.payload.synthetic, true);
  assert.equal(h.payload.perspective, 'operator');
  for (const r of recs) {
    assert.equal(r.v, 1);
    for (const k of ['tick', 'round', 'ts', 'kind', 'actor', 'channel', 'payload']) assert.ok(k in r, `record missing ${k}`);
  }
  recs.forEach((r, i) => assert.equal(r.tick, i, 'operator ticks are contiguous'));
});

test('utilities are always in [0,1]', () => {
  for (const id of IDS) {
    for (const seed of [1, 2, 3]) {
      const inst = instantiate(id, { seed });
      for (let i = 0; i < inst.N; i += 7) {
        assert.ok(inst.uUs[i] >= 0 && inst.uUs[i] <= 1 + 1e-12, `${id} uUs out of range`);
        assert.ok(inst.uThem[i] >= 0 && inst.uThem[i] <= 1 + 1e-12, `${id} uThem out of range`);
        const d = digitsAt(inst, i);
        assert.ok(Math.abs(utilityOf(inst, 'us', d) - inst.uUs[i]) < 1e-9);
      }
      assert.ok(inst.res.us >= 0 && inst.res.us <= 1 && inst.res.them >= 0 && inst.res.them <= 1);
      const s = inst.w.them.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(s - 1) < 1e-9, 'counterpart weights renormalised to 1');
    }
  }
});

test('Pareto frontier points are mutually non-dominated and cover the sample', () => {
  for (const id of IDS) {
    const A = analyse(instantiate(id, { seed: 42 }));
    const F = A.frontier;
    assert.ok(F.length > 1);
    for (const p of F) for (const q of F) {
      if (p === q) continue;
      const dominates = q.x >= p.x && q.y >= p.y && (q.x > p.x || q.y > p.y);
      assert.ok(!dominates, `${id}: frontier point dominated`);
    }
    for (const c of A.cloud) assert.ok(F.some((f) => f.x >= c.x - 1e-12 && f.y >= c.y - 1e-12), `${id}: cloud point not weakly dominated by frontier`);
  }
  const toy = [{ x: 0.1, y: 0.9 }, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.4 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.5 }];
  assert.deepEqual(paretoFrontier(toy).map((p) => [p.x, p.y]), [[0.1, 0.9], [0.5, 0.5], [0.9, 0.1]]);
});

test('Nash point maximises the product of gains over the sampled set', () => {
  for (const id of IDS) {
    const inst = instantiate(id, { seed: 42 });
    const A = analyse(inst);
    const N = nashPoint(A.cloud, inst.res.us, inst.res.them);
    if (!N) continue;
    for (const p of A.cloud) {
      if (p.x <= inst.res.us || p.y <= inst.res.them) continue;
      assert.ok((p.x - inst.res.us) * (p.y - inst.res.them) <= N.product + 1e-12, `${id}: point beats Nash`);
    }
    const Q = quickStats(inst);
    assert.equal(Q.nash.i, A.nash.i, 'fast pass and full analysis agree on Nash');
  }
  assert.equal(nashPoint([{ x: 0.2, y: 0.2 }], 0.5, 0.5), null, 'no point improves on disagreement → null');
});

test('AC_next accepts iff incoming ≥ my next offer and ≥ reservation', () => {
  assert.equal(acNext(0.6, 0.5, 0.4), true);
  assert.equal(acNext(0.5, 0.5, 0.4), true);
  assert.equal(acNext(0.45, 0.5, 0.4), false);
  assert.equal(acNext(0.6, 0.5, 0.65), false);
  // Every acceptance by our agent in real runs satisfied AC_next or the deadline rule.
  for (const id of IDS) for (const style of STYLE_ORDER) {
    const n = runNegotiation(id, { seed: 11, style });
    const recs = n.records;
    recs.forEach((r, i) => {
      if (r.kind !== 'assessment' || r.payload.decision !== 'accept') return;
      const p = r.payload;
      assert.ok(p.uIncoming >= p.reservation - 1e-9, 'accepted below reservation');
      const atDeadline = r.round === n.inst.rounds && r.actor === 'nso-negotiator';
      assert.ok(atDeadline || p.uIncoming >= p.uNext - 1e-4, 'accepted without AC_next');
    });
  }
});

test('Faratin targets: Boulware holds, Conceder concedes early, all end at reservation', () => {
  const o = { uMax: 1, uRes: 0.4 };
  const b = targetUtility(0.5, { ...o, e: 0.2 }), l = targetUtility(0.5, { ...o, e: 1 }), c = targetUtility(0.5, { ...o, e: 3 });
  assert.ok(b > l && l > c);
  for (const e of [0.2, 1, 3]) assert.ok(Math.abs(targetUtility(1, { ...o, e }) - 0.4) < 1e-12);
});

test('mandate gate: our agent never sends or accepts an over-cap package without an escalate event', () => {
  let escalations = 0, overrides = 0;
  for (const id of IDS) for (const style of STYLE_ORDER) for (const policy of ['park', 'deny', 'approve']) for (const seed of [42, 5, 99]) {
    const n = runNegotiation(id, { seed, style, policy });
    const inst = n.inst;
    for (const r of n.records) {
      if (r.kind !== 'move' || r.actor !== 'nso-negotiator' || !r.payload.offer) continue;
      const d = digitsFromOffer(inst, r.payload.offer);
      const gate = mandateCheck(inst, d);
      if (r.payload.kind === 'accept' && !gate.ok) {
        overrides++;
        assert.equal(r.payload.authoredBy, 'human', 'over-cap accept must be human-authored');
        const esc = n.records.find((x) => x.kind === 'escalate' && x.payload.blocking && x.tick < r.tick);
        assert.ok(esc, 'over-cap accept without a prior escalate record');
        const dec = n.records.find((x) => x.kind === 'human_decision' && x.payload.decision === 'approve' && x.tick < r.tick);
        assert.ok(dec, 'over-cap accept without human approval');
      } else {
        assert.ok(gate.ok, `${id}/${style}/${policy}: agent-authored ${r.payload.kind} outside mandate`);
      }
    }
    escalations += n.records.filter((x) => x.kind === 'escalate' && x.payload.blocking).length;
  }
  assert.ok(escalations > 0, 'some scenario exercises escalation');
  assert.ok(overrides > 0, 'approve policy exercises a human override');
  // Direct gate checks
  const inst = instantiate('odm-rack', { seed: 1 });
  const over = digitsFromOffer(inst, { price: 3400, delivery: 12, prepay: 20, warranty: 24, alloc: 128, follow: 'option' });
  const g = mandateCheck(inst, over);
  assert.equal(g.ok, false);
  assert.deepEqual(g.failed.map((c) => c.id), ['M1']);
  const big = digitsFromOffer(inst, { price: 3100, delivery: 12, prepay: 20, warranty: 24, alloc: 192, follow: 'option' });
  assert.deepEqual(mandateCheck(inst, big).failed.map((c) => c.id), ['M4'], 'award-value cap');
});

test('interactive escalation pauses until a human decides', () => {
  let n = null;
  for (const seed of [42, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const t = new Negotiation('xfmr-slot', { seed, style: 'linear', policy: 'interactive' }).runToEnd();
    if (t.pending) { n = t; break; }
  }
  assert.ok(n, 'transformer scenario escalates for some seed');
  assert.equal(n.done, false);
  const before = n.records.length;
  assert.equal(n.step(), 0, 'step does nothing while pending');
  assert.equal(n.records.length, before);
  n.decide('deny');
  n.runToEnd();
  assert.equal(n.done, true);
  assert.ok(['walked', 'settled'].includes(n.result.status));
  assert.ok(n.records.some((r) => r.kind === 'human_decision' && r.payload.decision === 'deny'));
});

test('perspective export removes excluded channels and keeps original tick numbers', () => {
  const n = runNegotiation('optics-broker', { seed: 42 });
  const all = n.records;
  assert.ok(all.some((r) => r.channel.startsWith('caucus-')), 'operator record contains the caucus');
  const us = exportPerspective(all, 'nso-negotiator');
  assert.ok(!us.some((r) => r.channel.startsWith('caucus-')), 'caucus removed from our view');
  assert.ok(!us.some((r) => r.channel.startsWith('brief-') && r.channel !== 'brief-nso-negotiator'), 'other briefs removed');
  const ticks = new Set(all.map((r) => r.tick));
  for (const r of us) assert.ok(ticks.has(r.tick));
  for (const r of us) assert.deepEqual(r.tick, all.find((x) => x.tick === r.tick).tick, 'tick not renumbered');
  assert.ok(tickGaps(us).length > 0, 'gaps reveal redactions');
  const h = us[0].payload;
  assert.equal(h.perspective, 'nso-negotiator');
  assert.ok(h.withheldEntries > 0 && h.redactions.includes('caucus'));
  const ctx = us.find((r) => r.kind === 'context');
  assert.ok(ctx.payload.parties.filter((p) => p.teamTwinName !== 'nso-negotiator').every((p) => p.withheld));
  const out = us.find((r) => r.kind === 'outcome');
  assert.equal(out.payload.operatorAnalysis, undefined);
  assert.equal(out.payload.scrubbedFor, 'nso-negotiator');
  // The broker can see its caucus but not our private brief.
  const br = exportPerspective(all, 'broker-omicron');
  assert.ok(br.some((r) => r.channel.startsWith('caucus-')));
  assert.ok(!br.some((r) => r.channel === 'brief-nso-negotiator'));
  // Operator export is a faithful copy.
  assert.equal(toNDJSON(exportPerspective(all, 'operator')), toNDJSON(all));
});

test('detector returns the honest placeholder when no rule fires', () => {
  const d = detectMove({ id: 'm1', partyTwin: 'a', channelId: 'plenary', roundNumber: 1, kind: 'message', text: 'Good morning, thank you.' }, {});
  assert.equal(d.length, 1);
  assert.equal(d[0].rule, 'R0');
  assert.equal(d[0].tag, 'positional-statement');
  assert.ok(d[0].confidence <= 0.3);
  assert.match(d[0].rationale, /not evidence/);
  assert.equal(RULES.length, 12);
});

test('detector rules fire on structured and text input; prohibited ones only from counterparts', () => {
  const t = detectText('For reference, Vendor Mu quoted another neocloud $455/module last week.', { party: 'b', kind: 'message' });
  assert.ok(t.some((x) => x.rule === 'R11' && x.prohibited));
  assert.ok(detectText('This is our final offer — take it or leave it.', { party: 'b' }).some((x) => x.rule === 'R9'));
  assert.ok(detectText('Could you share your volume forecast?', { party: 'b' }).some((x) => x.rule === 'R8'));
  const cdu = runNegotiation('cdu-new', { seed: 42 });
  const tac = cdu.records.filter((r) => r.kind === 'tactic');
  assert.ok(tac.some((r) => r.payload.ruleId === 'R10' && r.actor === 'thermal-sigma'), 'false deadline flagged');
  assert.ok(cdu.records.some((r) => r.kind === 'envoy' && r.payload.ruleId === 'R10'));
  const opt = runNegotiation('optics-broker', { seed: 42 });
  assert.ok(opt.records.some((r) => r.kind === 'tactic' && r.payload.ruleId === 'R11' && r.actor === 'broker-omicron'));
  assert.ok(opt.records.some((r) => r.kind === 'envoy' && r.payload.action === 'quarantine'));
  assert.ok(opt.records.some((r) => r.kind === 'tactic' && r.payload.ruleId === 'R7' && r.channel.startsWith('caucus-')));
  for (const id of IDS) for (const style of STYLE_ORDER) {
    const n = runNegotiation(id, { seed: 3, style, policy: 'approve' });
    const bad = n.records.filter((r) => r.kind === 'tactic' && r.actor === 'nso-negotiator' && r.payload.prohibited);
    assert.equal(bad.length, 0, `${id}/${style}: our agent emitted a prohibited tactic`);
  }
  // Every move gets at least one tactic record (rule or placeholder)
  const moves = opt.records.filter((r) => r.kind === 'move').map((r) => r.payload.id);
  for (const id of moves) assert.ok(opt.records.some((r) => r.kind === 'tactic' && r.payload.evidenceMoveIds.includes(id)));
});

test('Monte Carlo of 20 returns counts that sum to 20 and is deterministic', () => {
  for (const id of IDS) {
    const a = monteCarlo(id, { seed: 42, vary: 'seed+style' });
    const sum = Object.values(a.counts).reduce((x, y) => x + y, 0);
    assert.equal(sum, 20);
    assert.equal(a.rows.length, 20);
    const b = monteCarlo(id, { seed: 42, vary: 'seed+style' });
    assert.deepEqual(a, b);
  }
  const x = monteCarlo('xfmr-slot', { seed: 42, style: 'linear' });
  assert.ok(x.counts.escalated > 0, 'transformer scenario escalates in MC');
});

test('NDJSON: both recorded CoLab files parse; the Aurora view has no caucus records, the operator view does', () => {
  const op = parseNDJSON(readFileSync(join(RUNS, 'supply-10round-operator.ndjson'), 'utf8'));
  const av = parseNDJSON(readFileSync(join(RUNS, 'supply-10round-aurora-view.ndjson'), 'utf8'));
  assert.equal(op.errors.length, 0);
  assert.equal(av.errors.length, 0);
  assert.equal(op.perspective, 'operator');
  assert.equal(av.perspective, 'diplomacy-team-aurora');
  assert.ok(op.records.some((r) => r.channel.startsWith('caucus')));
  assert.ok(!av.records.some((r) => r.channel.startsWith('caucus')));
  assert.deepEqual(tickGaps(av.records).map((g) => [g.from, g.to]), [[50, 53]]);
  assert.equal(tickGaps(op.records).length, 0);
  // Our redaction of the operator file reproduces the recorded perspective export's tick set.
  const mine = exportPerspective(op.records, 'diplomacy-team-aurora');
  assert.deepEqual(mine.map((r) => r.tick), av.records.map((r) => r.tick));
  // Broken display name falls back to the twin id.
  const charlie = op.header.payload.parties.find((p) => p.teamTwinName === 'diplomacy-team-charlie');
  assert.equal(displayNameFor(charlie), 'Charlie');
  assert.equal(displayNameFor({ teamTwinName: 'x-aurora', displayName: 'Aurora (Buyer)' }), 'Aurora (Buyer)');
  // Readiness: BATNAs priced, reservations prose-only, no weights → not ready.
  const rd = readinessFromRecords(op.records);
  assert.equal(rd.ready, false);
  assert.equal(rd.inputs.filter((i) => i.ok).length, 2);
  // Synthetic operator records are ZOPA-ready.
  assert.equal(readinessFromRecords(runNegotiation('odm-rack', { seed: 1 }).records).ready, true);
  assert.equal(fixMojibake('a â€” b'), 'a — b');
});

test('NDJSON parser is defensive: bad lines are reported, never evaluated', () => {
  const txt = [
    '{"v":1,"tick":0,"round":0,"ts":"","kind":"header","actor":"system","channel":"plenary","payload":{"perspective":"operator"}}',
    'not json',
    '{"v":2,"tick":1,"kind":"move"}',
    '{"v":1,"kind":"move"}',
    '[1,2,3]',
    '{"v":1,"tick":2,"kind":"move","payload":"x"}',
    '{"v":1,"tick":3,"kind":"move","actor":"a","payload":{"text":"hello"}}',
  ].join('\n');
  const p = parseNDJSON(txt);
  assert.equal(p.records.length, 2);
  assert.equal(p.errors.length, 5);
  assert.equal(p.records[1].channel, 'plenary');
  assert.equal(parseNDJSON('x'.repeat(100), { maxBytes: 10 }).records.length, 0);
});
