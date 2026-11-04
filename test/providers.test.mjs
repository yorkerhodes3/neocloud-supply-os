// Risk-provider registry: every entry is complete and honest, the design names no
// provider outside provenance, and the simulation is provider-invariant.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAPABILITIES, SIGNALS, BASIS, SUPPORT, PROVIDERS, PROVIDER_ORDER, DEFAULT_PROVIDER, TOKEN,
  provider, tool, call, chain, coverage, labelProvider, registerProvider, fill,
} from '../docs/assets/js/providers.js';
import { Sim, REPORT_DAY } from '../docs/assets/js/sim/engine.js';
import { SCENARIOS, freshScenario } from '../docs/assets/js/sim/scenarios.js';

const VENDORS = ['Sayari', 'Tradeverifyd', 'Resilinc', 'Exiger'];

test('registry starts with the five required providers, GenerIQ as default', () => {
  assert.deepEqual(PROVIDER_ORDER.slice(0, 5), ['generiq', 'sayari', 'tradeverifyd', 'resilinc', 'exiger']);
  assert.equal(DEFAULT_PROVIDER, 'generiq');
  assert.equal(PROVIDERS.generiq.name, 'GenerIQ');
  assert.equal(CAPABILITIES.length, 11);
  assert.equal(SIGNALS.length, 10);
});

for (const id of PROVIDER_ORDER) {
  test(`${id}: every capability and signal is mapped with valid tags`, () => {
    const p = PROVIDERS[id];
    for (const k of ['name', 'short', 'ns', 'kind', 'focus']) assert.ok(p[k], `${id}.${k}`);
    assert.match(p.ns, /^[a-z0-9]+$/);
    for (const c of CAPABILITIES) {
      const t = p.tools[c.id];
      assert.ok(t, `${id} missing ${c.id}`);
      assert.ok(BASIS[t.basis], `${id}.${c.id} basis ${t.basis}`);
      assert.ok(SUPPORT[t.support], `${id}.${c.id} support ${t.support}`);
      if (t.support === 'gap') assert.ok(t.fallback, `${id}.${c.id} gap needs a fallback`);
      // A native name is only claimed where it is documented, seen in a reference build, or canonical.
      if (t.native) assert.ok(['documented', 'reference', 'canonical'].includes(t.basis), `${id}.${c.id} claims a name with basis ${t.basis}`);
      else assert.ok(t.support === 'gap' || ['announced', 'none'].includes(t.basis), `${id}.${c.id} unnamed but basis ${t.basis}`);
    }
    for (const s of SIGNALS) assert.ok(Array.isArray(p.factors[s.id]), `${id} factors.${s.id}`);
    if (p.kind === 'vendor') for (const s of p.sources) assert.match(s.url, /^https:\/\//);
  });
}

test('named-tool counts match the Appendix D0 analysis', () => {
  const named = Object.fromEntries(PROVIDER_ORDER.slice(0, 5).map(id => [id, coverage(PROVIDERS[id]).named]));
  assert.deepEqual(named, { generiq: 11, sayari: 11, tradeverifyd: 9, resilinc: 0, exiger: 0 });
  const doc = readFileSync('CONCEPT-IDEA.md', 'utf8');
  assert.match(doc, /### D0\. The risk provider is a variable/);
});

test('display names never overstate: stand-ins are marked, gaps name the fallback', () => {
  assert.equal(tool(PROVIDERS.resilinc, 'screen_entity').shown, '~screen_entity');
  assert.equal(tool(PROVIDERS.tradeverifyd, 'trace_upstream').shown, null);
  assert.equal(call(PROVIDERS.tradeverifyd, 'trace_upstream', 'x'), 'tradeverifyd: no trace_upstream → graph walk + shipments');
  assert.equal(call(PROVIDERS.generiq, 'search_entities', '"X", TW'), 'generiq: search_entities("X", TW)');
  assert.equal(chain(PROVIDERS.sayari, [['search_entities', 'a'], ['get_entity', 'b']]), 'sayari: search_entities(a) → get_entity_profile(b)');
});

test('white label and registration extend the registry without code changes elsewhere', () => {
  const w = labelProvider('Acme Risk Graph');
  assert.equal(w.name, 'Acme Risk Graph'); assert.equal(w.ns, 'acmeriskgraph'); assert.equal(w.kind, 'custom');
  assert.equal(call(w, 'screen_entity', 'id'), 'acmeriskgraph: screen_entity(id)');
  assert.equal(fill(`Signals from ${TOKEN}.`, w), 'Signals from Acme Risk Graph.');
  const p = registerProvider('zz_test', { name: 'ZZ', focus: 'test', tools: {}, factors: {} });
  assert.equal(coverage(p).unknown, 11);
  assert.ok(PROVIDER_ORDER.includes('zz_test'));
  delete PROVIDERS.zz_test; PROVIDER_ORDER.splice(PROVIDER_ORDER.indexOf('zz_test'), 1);
  assert.equal(provider('nope').name, 'GenerIQ');
});

test('simulation outcomes are identical for every provider; only labels change', () => {
  for (const sc of [SCENARIOS[0], ...SCENARIOS.filter(s => [2, 8, 9].includes(s.n))]) {
    const runs = PROVIDER_ORDER.map(id => { const s = new Sim({ seed: 42, mode: 'native', scenario: freshScenario(sc.n), provider: id }); s.advanceTo(240); return s; });
    const k0 = JSON.stringify(runs[0].kpis(REPORT_DAY));
    for (const r of runs) assert.equal(JSON.stringify(r.kpis(REPORT_DAY)), k0, `scenario ${sc.n} ${r.P.ns}`);
    assert.equal(new Set(runs.map(r => r.ledger.length)).size, 1);
  }
  const s8 = new Sim({ seed: 42, mode: 'native', scenario: freshScenario(8), provider: 'tradeverifyd' }); s8.advanceTo(240);
  assert.ok(s8.ledger.some(e => /tradeverifyd: search_entities\(/.test(e.text)), 'log uses the provider namespace');
  assert.ok(!s8.ledger.some(e => /sayari/i.test(e.text)));
});

// ---------- the design names no provider outside provenance ----------
const walk = (d) => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SITE_ALLOW = new Set(['docs/assets/js/providers.js', 'docs/providers.html', 'docs/assets/js/pages/providers.js']);

test('site text names no vendor outside the registry and provider kit', () => {
  const files = walk('docs').filter(f => /\.(html|js|css)$/.test(f) && !f.includes('/vendor/') && !f.includes('/runs/') && !SITE_ALLOW.has(f));
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    for (const v of VENDORS) assert.ok(!txt.includes(v) && !txt.includes(v.toLowerCase() + ':'), `${f} mentions ${v}`);
  }
});

test('concept and spec use the RISK_PROVIDER variable; vendor names only in provenance', () => {
  const doc = readFileSync('CONCEPT-IDEA.md', 'utf8');
  const spec = readFileSync('SPECIFICATION.md', 'utf8');
  assert.ok((doc.match(/RISK_PROVIDER/g) || []).length > 40);
  assert.ok((spec.match(/RISK_PROVIDER/g) || []).length > 20);
  assert.ok(!/Sayari MCP is the|FR-SAY|sayari_entity_id/.test(doc + spec));
  // Outside Appendix D, Appendix M and the amendment note, the concept names no vendor.
  const body = doc.split(/^## Appendix D /m)[0].replace(/\*\*Amendment after review[\s\S]*?\n\n/, '');
  for (const v of VENDORS) assert.ok(!body.includes(v), `concept body mentions ${v}`);
});
