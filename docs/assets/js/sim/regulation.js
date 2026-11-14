// Proposed rules are planning assumptions, never amendments to the live policy.
import { SITES, GPUS_PER_RACK } from './world.js';

export const REGULATION_DEFAULTS = {
  version: 1, title: 'Reported Chinese optical-transceiver restriction',
  status: 'reported', startDate: '2028-01-01', signalDay: 20, effectiveDay: 60,
  generation: '3.2T', minimumGeneration: '3.2T', scope: 'us',
  exemptionPct: 65, qualificationDays: 30, premiumPct: 12,
};
const GENERATIONS = ['800G', '1.6T', '3.2T'];

export const REGULATION_SOURCES = [
  { id: 'FCC-26-50', basis: 'Primary source located', title: 'FCC component rule and further proposals',
    url: 'https://docs.fcc.gov/public/attachments/FCC-26-50A1.pdf',
    note: 'Hardware component rule is conditional on Covered List scope; not a blanket ban on Chinese parts or Western-branded servers.' },
  { id: 'FR-2026-18535', basis: 'Primary source located', title: 'Final rule: effective October 13, 2026',
    url: 'https://www.federalregister.gov/documents/2026/09/11/2026-18535/protecting-against-national-security-threats-to-the-communications-supply-chain-through-the',
    note: 'Indexed official text corroborates the effective date. New authorizations and existing equipment must be distinguished.' },
  { id: 'S-5548', basis: 'Introduced bill, not enacted law', title: 'S. 5548, introduced September 24, 2026',
    url: 'https://www.govinfo.gov/content/pkg/BILLS-119s5548is/xhtml/BILLS-119s5548is.html',
    note: 'Names InnoLight and Eoptolink, affiliates and component/software/firmware paths; five years after enactment, not introduction. Critical-system scope needs legal review.' },
  { id: 'FR-2026-11571', basis: 'Primary source located', title: 'June 10, 2026: Section 1260H designation notice',
    url: 'https://www.federalregister.gov/documents/2026/06/10/2026-11571/notice-of-availability-of-designation-of-chinese-military-companies',
    note: 'Lists Zhongji InnoLight. A military-company designation is not itself an FCC Covered List entry or an OFAC sanction.' },
  { id: 'DA-26-278', basis: 'Primary source located', title: 'March 23, 2026: foreign-produced routers',
    url: 'https://docs.fcc.gov/public/attachments/DA-26-278A1.pdf',
    note: 'Check the defined router class; do not assume every datacenter leaf/spine switch is covered.' },
  { id: 'DA-26-286', basis: 'Primary source located', title: 'Router scope and software/firmware update waiver',
    url: 'https://docs.fcc.gov/public/attachments/DA-26-286A1.pdf',
    note: 'Indexed text refers to consumer-grade, primarily residential routers; specified updates permitted at least until March 1, 2027.' },
  { id: 'FCC-COVERED-LIST', basis: 'Primary source located', title: 'FCC Covered List and conditional approvals',
    url: 'https://www.fcc.gov/supplychain/coveredlist',
    note: 'Indexed router approvals include 2027-2028 expiry dates. Check the exact model, approval conditions and current version.' },
  { id: 'DA-26-786', basis: 'Primary source located', title: 'July 28, 2026: foreign-produced power inverters',
    url: 'https://docs.fcc.gov/public/attachments/DA-26-786A1.pdf',
    note: 'DoW/DHS conditional approvals matter; an inverter action is not a blanket prohibition on transformers or UPS assemblies.' },
  { id: 'DA-26-789', basis: 'Primary source located', title: 'Inverter software/firmware update waiver',
    url: 'https://docs.fcc.gov/public/attachments/DA-26-789A1.pdf',
    note: 'Indexed text permits specified updates for authorized devices at least until January 1, 2029; not a universal firmware exemption.' },
  { id: 'OPTICS-REPORT', basis: 'Secondary reporting only', title: 'Reported optical-transceiver proposal',
    url: 'https://roctelecom.com/insights/chinese-data-center-component-ban/',
    note: 'No primary source located for the exact 3.2T, 2028-2029 ramp or 65% US-value terms. Treat all three as assumptions.' },
];

export const STUDENT_TEMPLATE = {
  analysisId: 'student-team-demo', asOf: '2026-11-14',
  parts: [{
    siteId: 'TX1', partNumber: 'DEMO-OPT-32', manufacturer: 'Synthetic optics manufacturer',
    provider: 'sayari', entityId: 'DEMO-ENTITY-NOT-A-REAL-ID',
    relationship: 'component manufacturer -> transceiver -> rack lot',
    sourceUrl: 'https://example.com/student-evidence', confidence: 'low',
    originCountry: 'CN', generation: '3.2T', usBomPct: 40, authorization: 'new',
  }],
};

function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}: enter 1-${max} characters.`);
  return value.trim();
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label}: expected ${allowed.join(', ')}.`);
  return value;
}
function number(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: expected a number from ${min} to ${max}.`);
  return value;
}
function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${label}: expected a valid YYYY-MM-DD date.`);
  return value;
}

export function validateRegulation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) throw new Error('Regulation: expected a version 1 object.');
  const value = {
    version: 1, title: text(input.title, 'Title', 120),
    status: choice(input.status, ['reported', 'proposed', 'hypothetical'], 'Intelligence status'),
    startDate: date(input.startDate, 'Planning window start'),
    signalDay: number(input.signalDay, 0, 240, 'Signal day'),
    effectiveDay: number(input.effectiveDay, 0, 240, 'Assumed enforcement day'),
    generation: choice(input.generation, GENERATIONS, 'Deployment generation'),
    minimumGeneration: choice(input.minimumGeneration, GENERATIONS, 'First affected generation'),
    scope: choice(input.scope, ['us', 'all'], 'Planning scope'),
    exemptionPct: input.exemptionPct === null ? null : number(input.exemptionPct, 0, 100, 'Assumed exemption'),
    qualificationDays: number(input.qualificationDays, 1, 180, 'Qualification days'),
    premiumPct: number(input.premiumPct, 0, 100, 'Redesign premium'),
  };
  if (value.effectiveDay < value.signalDay) throw new Error('Assumed enforcement day must be on or after signal day.');
  if (value.scope === 'all' && value.status !== 'hypothetical') throw new Error('All-site reach requires hypothetical status; a reported US measure does not automatically reach UK or Norway.');
  return value;
}

export function validateStudentAnalysis(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Student analysis: expected a JSON object.');
  if (!Array.isArray(input.parts) || !input.parts.length || input.parts.length > SITES.length) throw new Error(`Student analysis: supply 1-${SITES.length} site-level optics findings.`);
  const seen = new Set();
  const parts = input.parts.map((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`Part ${i + 1}: expected an object.`);
    const siteId = choice(p.siteId, SITES.map(s => s.id), `Part ${i + 1} site`);
    if (seen.has(siteId)) throw new Error(`Duplicate optics finding for ${siteId}; merge or resolve conflicting evidence first.`);
    seen.add(siteId);
    let url;
    try { url = new URL(p.sourceUrl); } catch { throw new Error(`Part ${i + 1} source URL: expected HTTPS.`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Part ${i + 1} source URL: expected HTTPS without credentials.`);
    return {
      siteId, partNumber: text(p.partNumber, 'Part number'), manufacturer: text(p.manufacturer, 'Manufacturer'),
      provider: text(p.provider, 'Risk provider', 60), entityId: text(p.entityId, 'Provider entity ID'),
      relationship: text(p.relationship, 'Evidence path', 500), sourceUrl: text(url.href, 'Source URL', 1000),
      confidence: choice(p.confidence, ['low', 'medium', 'high'], 'Confidence'),
      originCountry: choice(p.originCountry, ['CN', 'US', 'other', 'unknown'], 'Manufacturing origin'),
      generation: choice(p.generation, GENERATIONS, 'Part generation'),
      usBomPct: p.usBomPct === null ? null : number(p.usBomPct, 0, 100, 'US BOM value percent'),
      authorization: choice(p.authorization, ['new', 'existing', 'unknown'], 'Authorization'),
    };
  });
  return { analysisId: text(input.analysisId, 'Analysis ID'), asOf: date(input.asOf, 'Analysis as-of'), parts };
}

export function planningDate(config, day) {
  return new Date(Date.parse(config.startDate) + day * 86400000).toISOString().slice(0, 10);
}

export function opticsFinding(config, siteId, analysis = null) {
  // An import replaces the fixture, not missing evidence: uncovered sites become unknown.
  if (analysis) return analysis.parts.find(p => p.siteId === siteId) || {
    siteId, partNumber: 'Unmapped', manufacturer: 'Unknown', originCountry: 'unknown',
    generation: config.generation, usBomPct: null, authorization: 'unknown', confidence: 'low',
  };
  return {
    siteId, partNumber: `SYNTHETIC-${config.generation}`, manufacturer: 'Synthetic CN component maker',
    originCountry: 'CN', generation: config.generation, usBomPct: 40,
    authorization: 'new', confidence: 'low',
  };
}

export function assessOptics(config, finding) {
  if (config.scope === 'us' && finding.siteId !== 'TX1') return { status: 'out-of-scope', reason: 'Non-US site; no assumed extraterritorial reach.' };
  if (GENERATIONS.indexOf(finding.generation) < GENERATIONS.indexOf(config.minimumGeneration)) return { status: 'out-of-scope', reason: 'Earlier generation than the assumed phase-in.' };
  if (finding.authorization === 'existing') return { status: 'exempt', reason: 'Existing authorized model; no installed-base removal assumed.' };
  if (finding.originCountry === 'unknown' || finding.authorization === 'unknown') return { status: 'unknown', reason: 'Manufacturing origin or authorization evidence missing.' };
  if (finding.originCountry !== 'CN') return { status: 'out-of-scope', reason: 'Not Chinese manufacture under this simplified assumption; ownership still needs review.' };
  if (config.exemptionPct !== null && finding.usBomPct === null) return { status: 'unknown', reason: 'US BOM value evidence missing; exemption cannot be inferred.' };
  if (config.exemptionPct !== null && finding.usBomPct >= config.exemptionPct) return { status: 'exempt', reason: 'Meets the assumed US-value threshold, not an official exemption.' };
  return { status: 'affected', reason: 'New model meets assumed origin/generation scope; not a legal determination.' };
}

export function regulationExposure(sim, config, analysis = null) {
  const counts = { affected: 0, unknown: 0, exempt: 0, 'out-of-scope': 0 };
  let gpus = 0, valueM = 0;
  const sites = SITES.map(site => {
    const finding = opticsFinding(config, site.id, analysis), assessment = assessOptics(config, finding);
    const lines = sim.lines.filter(l => l.kind === 'optics' && l.site.id === site.id);
    counts[assessment.status] += lines.length;
    if (['affected', 'unknown'].includes(assessment.status)) {
      gpus += lines.reduce((n, l) => n + l.lot.racks.length * GPUS_PER_RACK, 0);
      valueM += lines.reduce((n, l) => n + l.value, 0);
    }
    return { site, finding, ...assessment, lots: lines.length };
  });
  return { counts, gpus, valueM, sites };
}

export function withRegulation(base, input, analysis = null) {
  if (!input) return base;
  const config = validateRegulation(input);
  return {
    ...base,
    setup(sim) {
      base?.setup?.call(base, sim);
      const exposure = regulationExposure(sim, config, analysis);
      for (const l of sim.lines.filter(l => l.kind === 'optics')) {
        l.regulationFinding = opticsFinding(config, l.site.id, analysis);
        l.M = { ...l.M, unit: `1,152 × ${l.regulationFinding.generation} transceivers (planning assumption)` };
      }
      const candidates = sim.lines.filter(l => l.kind === 'optics' && ['affected', 'unknown'].includes(
        assessOptics(config, opticsFinding(config, l.site.id, analysis)).status));
      const gate = sim.gate({
        id: 'PROPOSED-REGULATION', stage: 'ship', desk: 'Screener',
        label: 'simulation-only assumed new-model authorization restriction / evidence review',
        match: l => sim.t >= config.effectiveDay && candidates.includes(l),
      });
      sim.at(config.signalDay, () => {
        sim.log('Watchtower', `ProposedRegulationInjected: ${config.title} [${config.status}; SIMULATION ONLY]; assumed enforcement ${planningDate(config, config.effectiveDay)}; ${exposure.counts.affected} affected / ${exposure.counts.unknown} unknown optics lots`, { kind: 'risk', sev: 'warn' });
        const lag = sim.lag('proposed-regulation', 0.1, [3, 7, 12]);
        sim.after(lag, () => {
          sim.detected('Proposed regulation intelligence (not enacted policy)', config.signalDay);
          if (!candidates.length) {
            sim.log('Screener', 'Proposed regulation: no exposure under the selected assumptions; continue baseline.', { kind: 'risk', sev: 'ok' });
            return;
          }
          sim.decide({
            title: 'Planning only: approve compliant optics redesign and qualification?',
            desk: 'Resilience', rec: 'redesign',
            why: `${config.title}. ${exposure.counts.affected} assumed affected lots; ${exposure.counts.unknown} need evidence. No production holds, sanctions or real purchases. Qualification ${config.qualificationDays} d, premium ${config.premiumPct}%, all illustrative.`,
            options: [
              { id: 'redesign', label: 'Approve modelled redesign', effect: s => {
                const pending = candidates.filter(l => s.notShipped(l) || gate.parked.includes(l));
                // Keep unrelated scenario/decision holds; qualification has its own key.
                for (const l of pending) s.hold(l, 'REGULATION-QUALIFICATION');
                s.after(config.qualificationDays, () => {
                  for (const l of pending) {
                    s.cost.premium += l.value * config.premiumPct / 100;
                    s.release(l, 'REGULATION-QUALIFICATION');
                  }
                  s.openGate(gate.id);
                  s.log('Quality Sentinel', `Simulation-only compliant component redesign qualified for ${pending.length} optics lots; distributor unchanged. Unknown evidence assumed resolved for this mitigation, not verified.`, { kind: 'risk', sev: 'ok' });
                });
              } },
              { id: 'wait', label: 'Wait for evidence / final rule', effect: s => s.log('Screener', 'Simulation-only wait: new-model deliveries may remain gated at the assumed enforcement date. Existing authorizations and shipments already dispatched are not recalled.', { kind: 'risk', sev: 'warn' }) },
            ],
          });
        });
      });
    },
  };
}
