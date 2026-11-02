// Disruption scenarios 1–16 from CONCEPT-IDEA.md §… "Disruption playbooks", made executable.
// Each scenario injects the SAME physical shock into both runs; what differs is when it is
// detected and what each operating model can do about it. Counterparties are fictional.
import { supplier, SITES } from './world.js';
import { short } from './engine.js';

const P = (id) => { const s = supplier(id); return [s.lon, s.lat]; };
const S = (id) => { const s = SITES.find(x => x.id === id); return [s.lon, s.lat]; };
const racks = (sim, f = () => true) => sim.lines.filter(l => l.kind === 'rack' && f(l));
const names = (ls) => ls.length ? ls.map(short).join(', ') : 'none';

/** Shared onset/detect wiring. */
function wire(sim, sc, { onset, detect, native, legacy }) {
  sim.at(sc.at, () => onset?.(sim));
  const lag = sim.lag(`sc${sc.n}`, sc.detect.native, sc.detect.legacy);
  sim.at(sc.at + lag, () => {
    sim.detected(sc.title, sc.at);
    detect?.(sim);
    (sim.mode === 'native' ? native : legacy)?.(sim);
  });
}

export const SCENARIOS = [
  {
    n: 0, title: 'Baseline', at: null, focus: null,
    model: 'Three signed contracts (Prairie-1 Texas, Fjord-1 Norway, Midland-1 UK): 128 rack-scale systems, 9,216 GPUs. No disruption: the difference you see is operating-model latency alone.',
    detect: { native: 0, legacy: [0, 0, 0] },
    setup() {},
  },
  {
    n: 1, title: 'Accelerator allocation cut', at: 30, focus: P('ACC'),
    model: 'An AllocationNotice cuts four rack lots\u2019 accelerator allocation for 21 days. Native: the Allocator gives the slip to the lots with the most slack, protecting committed need-by dates. Legacy: the next four lots in the queue take it.',
    detect: { native: 0.05, legacy: [7, 10, 14] },
    setup(sim) {
      const N = 4, SLIP = 21;
      wire(sim, this, {
        onset: (s) => {
          s.flag('ACC', 'warn', 'AllocationNotice: −4 lots for 3 weeks'); s.flag('ODM1', 'warn', 'Build schedule drift');
          s.alert({ at: P('ACC'), label: 'Allocation cut', sev: 'warn', days: 18 });
          s.msg('Collaboration', 'AllocationNotice', 'ACC', 'in', null, `${N} rack lots slip ${SLIP} d`);
          if (s.mode === 'legacy') { const v = racks(s, l => s.notShipped(l)).slice(0, N); v.forEach(l => s.extend(l, 'make', SLIP)); }
        },
        native: (s) => {
          const slack = (l) => l.hall.needBy - s.eta(l);
          const v = racks(s, l => s.notShipped(l)).sort((a, b) => slack(b) - slack(a)).slice(0, N);
          v.forEach(l => { s.extend(l, 'make', SLIP); l.leadBias = (l.leadBias || 0) + SLIP; });
          s.log('Allocator', `Waves re-planned: slip assigned to ${names(v)} (most slack); committed dates protected`, { sev: 'ok' });
          s.decide({ title: 'Send the affected customer a schedule notice (inside contract window)', desk: 'Conductor', why: 'Agents may not message customers about schedule changes; a human owns the relationship.', rec: 'send',
            options: [{ id: 'send', label: 'Send notice' }, { id: 'hold', label: 'Hold notice' }] });
        },
      });
    },
  },
  {
    n: 2, title: 'Upstream HBM / packaging constraint', at: 20, focus: P('HBM'),
    model: 'A tier-3 memory constraint: rack builds that start after day 40 wait 16 days for HBM kits. Native runs just-in-time, so it is exposed: the Mapper sees the signal and asks a human to approve pulling call-offs forward. Legacy ordered everything early, so it is hedged by accident and pays for it in idle capital.',
    detect: { native: 0.2, legacy: [20, 25, 32] },
    setup(sim) {
      const FROM = 40, SLIP = 16;
      sim.hook('begin', (s, l, stage) => {
        if (stage === 'make' && l.kind === 'rack' && l.supId === 'ODM1' && s.t >= FROM) { s.extend(l, 'make', SLIP); s.log('Buyer', `${short(l)} build waits for HBM kits (+${SLIP} d)`, { sev: 'warn', line: l }); }
      });
      wire(sim, this, {
        onset: (s) => { s.flag('HBM', 'warn', 'Tier-3 capacity constraint'); s.flag('FAB', 'warn', 'Packaging queue'); s.alert({ at: P('HBM'), label: 'HBM constraint', sev: 'warn', days: 25 }); },
        native: (s) => {
          s.log('Mapper', 'sayari: get_upstream_supply_chain(rack system) → HBM supplier at tier 3 flagged; risk-adjusted lead +16 d for builds after day 40', { sev: 'warn' });
          const waiting = () => s.lines.filter(l => l.kind === 'rack' && l.stage === 'release' && l.state === 'waiting');
          const n = waiting().length;
          s.decide({ title: `Pre-buy: call off ${n} rack lots now (≈$${(n * 27.2).toFixed(0)}M committed early, above mandate)`, desk: 'Planner', why: 'Pulling forward avoids the kit queue but holds capital longer.', rec: 'approve',
            options: [{ id: 'approve', label: 'Approve pre-buy', effect: (x) => waiting().forEach(l => x.callOff(l, 'beat HBM kit queue')) },
              { id: 'within', label: 'Only within mandate (Texas lots)', effect: (x) => waiting().filter(l => l.site.id === 'TX1').forEach(l => x.callOff(l, 'within mandate')) }] });
        },
      });
    },
  },
  {
    n: 3, title: 'Optical transceiver shortage', at: 40, focus: P('OPT1'),
    model: 'Lumen Optics\u2019 quoted lead times drift +28 days. Native activates the pre-qualified alternate (Coastline Photonics, reached through Envoy) after a human approves the price premium. Legacy notices at the ASN slip and must qualify a new source first (30 days).',
    detect: { native: 0.5, legacy: [10, 12, 16] },
    setup(sim) {
      const SLIP = 28, ALT = [10, 14, 20];
      const open = (s) => s.lines.filter(l => l.kind === 'optics' && l.supId === 'OPT1' && s.notShipped(l));
      wire(sim, this, {
        onset: (s) => { open(s).forEach(l => s.extend(l, 'make', SLIP)); s.flag('OPT1', 'warn', 'Lead time +28 d'); s.alert({ at: P('OPT1'), label: 'Optics shortage', sev: 'warn', days: 20 }); },
        native: (s) => s.decide({ title: `Activate alternate Coastline Photonics for ${open(s).length} optics lots at +9% (mandate +5%)`, desk: 'Category Strategist', why: 'Alternate is qualified; price premium exceeds mandate.', rec: 'approve',
          options: [{ id: 'approve', label: 'Approve alternate', effect: (x) => open(x).forEach(l => { x.resource(l, 'OPT2', 'shortage at primary', { make: ALT }); x.cost.premium += l.value * 0.09; }) },
            { id: 'wait', label: 'Wait for primary' }] }),
        legacy: (s) => s.after(30, () => open(s).forEach(l => s.resource(l, 'OPT2', 'after 30-day qualification', { make: ALT }))),
      });
    },
  },
  {
    n: 4, title: 'Transformer slip', at: 45, focus: P('XF1'),
    model: 'Volta\u2019s factory test slot for Prairie-1\u2019s transformer slips 45 days. Native: the LLE Expeditor finds a factory-tested secondary-market unit in Finland and a human approves the premium. Legacy hears on the monthly call and negotiates a 10-day expedite.',
    detect: { native: 1.0, legacy: [12, 14, 21] },
    setup(sim) {
      const xf = () => sim.sites.find(s => s.id === 'TX1').xfmr;
      wire(sim, this, {
        onset: (s) => { s.extend(xf(), 'make', 45); s.flag('XF1', 'risk', 'Test slot slipped 45 d'); s.alert({ at: P('XF1'), label: 'Transformer slip', days: 25 }); s.msg('Collaboration', 'CommitUpdate', 'XF1', 'in', xf(), 'ship +45 d'); },
        native: (s) => s.decide({ title: 'Buy a secondary-market 60 MVA unit (Nordkraft, in stock) at +38% ($1.7M premium)', desk: 'LLE Expeditor', why: 'Restores Prairie-1 energisation before the utility date; exceeds mandate.', rec: 'approve',
          options: [{ id: 'approve', label: 'Approve purchase', effect: (x) => { if (x.resource(xf(), 'XF2', 'secondary market', { make: [8, 12, 16] })) x.cost.premium += 1.7; } },
            { id: 'wait', label: 'Wait for the slot' }] }),
        legacy: (s) => s.decide({ title: 'Expedite request to Volta', desk: 'Buyer', why: 'Committee approval for expedite fee.', rec: 'expedite', options: [{ id: 'expedite', label: 'Pay expedite', effect: (x) => { x.extend(xf(), 'make', -10); x.cost.expedite += 0.4; } }] }),
      });
    },
  },
  {
    n: 5, title: 'Utility interconnection delay', at: 55, focus: S('UK1'),
    model: 'The grid operator\u2019s queue update moves Midland-1\u2019s energisation from day 118 to day 160. Native: the Power Broker reads the filing the same day and proposes bridge generation. Legacy learns at the monthly utility meeting and goes to committee.',
    detect: { native: 0.5, legacy: [21, 28, 35] },
    setup(sim) {
      const site = () => sim.sites.find(s => s.id === 'UK1');
      const interim = (x) => { const s = site(); const ready = x.t + x.phys('UK1|bridge', [21, 26, 32]) + 3; s.interim = true; x.cost.premium += 2.8; x.setUtility(s, Math.max(118, Math.min(s.utilityAt, ready)), 'interim generation'); };
      wire(sim, this, {
        onset: (s) => { s.setUtility(site(), 160, 'grid queue update'); s.alert({ at: S('UK1'), label: 'Grid delay', days: 30 }); },
        native: (s) => s.decide({ title: 'Interim power: 6 MW bridge generation + battery, $2.8M (permits assumed in hand)', desk: 'Power Broker', why: 'Utility slip of 42 days on Midland-1.', rec: 'approve', options: [{ id: 'approve', label: 'Approve bridge power', effect: interim }, { id: 'wait', label: 'Wait for utility' }] }),
        legacy: (s) => s.decide({ title: 'Interim power business case', desk: 'Committee', why: 'Capex committee.', rec: 'approve', latency: s.adm('uk1committee', [10, 14, 21]), options: [{ id: 'approve', label: 'Approve', effect: interim }] }),
      });
    },
  },
  {
    n: 6, title: 'Export-control rule change', at: 50, focus: P('ODM1'),
    model: 'A new rule (hypothetical) requires a licence to export rack systems to the Norwegian and UK sites. Native: Customs reads the RegulationVersionPublished event, a human confirms the classification, licences are filed the same day. Legacy finds out when a shipment is stopped.',
    detect: { native: 0.05, legacy: [6, 9, 14] },
    setup(sim) {
      const grant = (x, extra = 0) => x.after(extra + x.phys('licence', [14, 20, 30]), () => { x.openGate('EXP'); x.log('Customs', 'Export licences granted; held lots released', { sev: 'ok' }); });
      wire(sim, this, {
        onset: (s) => { s.gate({ id: 'EXP', stage: 'ship', label: 'export licence required (new rule)', match: (l) => l.kind === 'rack' && l.site.id !== 'TX1' }); s.alert({ at: P('ODM1'), label: 'Export rule', sev: 'warn', days: 20 }); },
        native: (s) => s.decide({ title: 'Confirm classification and file licences for the EU-bound rack lots', desk: 'Customs', why: 'Interpretation of a new rule is reserved to humans.', rec: 'file', options: [{ id: 'file', label: 'Confirm & file', effect: (x) => grant(x) }] }),
        legacy: (s) => grant(s, s.adm('legal-review', [5, 8, 12])),
      });
    },
  },
  {
    n: 7, title: 'Tariff change on servers', at: 30, focus: P('ODM1'),
    model: 'A 25% tariff (hypothetical) on rack systems of Taiwanese origin entering the US takes effect on day 50. Native re-costs open orders and, with approval, moves unbuilt Texas lots to the Mexican ODM. Legacy re-costs in spreadsheets; re-sourcing needs a 45-day qualification.',
    detect: { native: 0.1, legacy: [3, 5, 8] },
    setup(sim) {
      const EFFECTIVE = 50, RATE = 0.25;
      sim.hook('complete', (s, l, stage) => {
        if (stage === 'clear' && l.kind === 'rack' && l.site.id === 'TX1' && supplier(l.supId).cc === 'TW' && s.t >= EFFECTIVE) { s.cost.tariff += l.value * RATE; s.log('Customs', `Tariff paid on ${short(l)}: $${(l.value * RATE).toFixed(1)}M`, { sev: 'risk', line: l }); }
      });
      const tx = (s) => racks(s, l => l.site.id === 'TX1' && l.supId === 'ODM1' && s.notShipped(l) && !['make'].includes(l.stage));
      wire(sim, this, {
        onset: (s) => s.alert({ at: S('TX1'), label: 'Tariff change', sev: 'warn', days: 20 }),
        native: (s) => s.decide({ title: `Re-source ${tx(s).length} unbuilt Texas lots to Northbridge (MX), +3% unit price`, desk: 'Category Strategist', why: 'Avoids ≈25% tariff; mandate allows origin changes only with approval.', rec: 'approve',
          options: [{ id: 'approve', label: 'Approve re-source', effect: (x) => tx(x).forEach(l => { x.resource(l, 'ODM2', 'tariff avoidance'); x.cost.premium += l.value * 0.03; }) }, { id: 'keep', label: 'Keep origin, pay tariff' }] }),
        legacy: (s) => s.after(45, () => tx(s).forEach(l => s.resource(l, 'ODM2', 'after 45-day qualification'))),
      });
    },
  },
  {
    n: 8, title: 'Sanctions designation in ownership chain', at: 75, focus: P('OPT1'),
    model: 'A party controlling 52% of Lumen Optics through two holding companies is designated. Native: Sayari re-screening catches the list delta within the hour; payments and new commitments are held and a human chooses clear or exit. Legacy screens at onboarding only; the bank flags a payment weeks later. Every payment or PO in between counts as exposure.',
    detect: { native: 0.02, legacy: [20, 25, 35] },
    setup(sim) {
      const open = (s) => s.lines.filter(l => l.supId === 'OPT1' && s.notShipped(l));
      const exit = (x) => open(x).forEach(l => x.resource(l, 'OPT2', 'exit designated supplier', { make: [10, 14, 20] }));
      wire(sim, this, {
        onset: (s) => { s.sup.OPT1.sanctioned = true; s.alert({ at: P('OPT1'), label: 'Designation', days: 30 }); },
        detect: (s) => {
          s.flag('OPT1', 'risk', 'Designated party in ownership chain'); s.sup.OPT1.hold = true;
          s.gate({ id: 'SAN', stage: 'order', label: 'sanctions hold on new commitments', desk: 'Screener', match: (l) => l.supId === 'OPT1' });
        },
        native: (s) => {
          s.log('Screener', 'sayari: list delta → search_entities("Lumen Optics") → traverse_network(owned_by, depth 3): designated party holds 52% via 2 holding cos (simulated)', { sev: 'risk', sup: 'OPT1' });
          s.decide({ title: 'Clear or exit Lumen Optics (designated party controls 52%)', desk: 'Screener', why: 'Legal review required; agents have already held payments and new POs.', rec: 'exit',
            options: [{ id: 'exit', label: 'Exit: move open lots to Coastline', effect: exit }, { id: 'hold', label: 'Hold 10 days for legal opinion', effect: (x) => x.after(10, () => exit(x)) }] });
        },
        legacy: (s) => s.after(30, () => exit(s)),
      });
    },
  },
  {
    n: 9, title: 'Forced-labour detention at port', at: 45, focus: S('TX1'),
    model: 'A withhold-release order (hypothetical) on aluminium in a power-shelf sub-component detains rack systems entering the US. Native: Sayari forced-labour risk factors on a tier-3 smelter fire first; Provenance assembles a traceability packet before the lots land. Legacy assembles evidence after detention.',
    detect: { native: 0.1, legacy: [1, 2, 4] },
    setup(sim) {
      const g = () => sim.gate({ id: 'WRO', stage: 'clear', label: 'detained pending admissibility evidence', match: (l) => l.kind === 'rack' && l.site.id === 'TX1' && l.supId === 'ODM1' });
      wire(sim, this, {
        onset: (s) => { g(); s.alert({ at: S('TX1'), label: 'Detention order', days: 30 }); },
        native: (s) => {
          s.log('Provenance', 'sayari: get_upstream_supply_chain(power shelf) → lookup_risk_factors → forced-labour flag on tier-3 smelter (simulated)', { sev: 'risk' });
          s.msg('Risk and compliance', 'EvidenceRequest', 'ODM1', 'out', null, 'smelter-level traceability');
          s.decide({ title: 'Sign off the admissibility packet (trade counsel)', desk: 'Provenance', why: 'Filing evidence with customs is a human act.', rec: 'submit',
            options: [{ id: 'submit', label: 'Submit packet', effect: (x) => x.after(x.phys('packet', [2, 3, 5]), () => { x.openGate('WRO'); x.log('Customs', 'Admissibility accepted; lots released', { sev: 'ok' }); }) }] });
        },
        legacy: (s) => s.after(s.adm('wro-evidence', [20, 35, 60]), () => { s.openGate('WRO'); s.log('Customs', 'Admissibility accepted after evidence scramble', { sev: 'ok' }); }),
      });
    },
  },
  {
    n: 10, title: 'Regional disruption at a concentration point', at: 50, focus: P('ODM1'),
    model: 'A regional event halts exports from Taiwan for about three weeks and slows factories. Native runs the regional playbook: with approval, unbuilt lots move to the Mexican ODM. Legacy waits it out.',
    detect: { native: 0.05, legacy: [1, 1.5, 3] },
    setup(sim) {
      const tw = (l) => supplier(l.supId).cc === 'TW';
      const open = (s) => racks(s, l => l.supId === 'ODM1' && s.notShipped(l) && l.stage !== 'make');
      wire(sim, this, {
        onset: (s) => {
          s.gate({ id: 'TW', stage: 'ship', label: 'regional export halt', desk: 'Dispatcher', match: tw });
          s.lines.filter(l => tw(l) && l.stage === 'make' && !l.done).forEach(l => s.extend(l, 'make', 6));
          s.after(s.phys('tw-halt', [16, 21, 28]), () => { s.openGate('TW'); s.log('Dispatcher', 'Exports from Taiwan resume', { sev: 'ok' }); });
          s.flag('ODM1', 'risk', 'Regional disruption'); s.alert({ at: P('ODM1'), label: 'Regional disruption', days: 24 });
        },
        native: (s) => s.decide({ title: `Strategic re-allocation: move ${open(s).length} unbuilt rack lots to Northbridge (MX), +4%`, desk: 'Resilience', why: 'Regional playbook; allocation shift beyond mandate.', rec: 'approve',
          options: [{ id: 'approve', label: 'Approve re-allocation', effect: (x) => open(x).forEach(l => { x.resource(l, 'ODM2', 'regional playbook'); x.cost.premium += l.value * 0.04; }) }, { id: 'wait', label: 'Wait it out' }] }),
      });
    },
  },
  {
    n: 11, title: 'Cargo theft or counterfeit', at: null, focus: S('TX1'), trigger: 'rack:TX1-H2-L2 haul',
    model: 'A seal breaks on the truck leg of one Texas rack lot and two systems come back with swapped components. Native: route-anomaly ShipmentEvents and attestation at receipt catch it in minutes; two replacements ship. Legacy finds it at burn-in and the whole lot is held for investigation.',
    detect: { native: 0.01, legacy: [0, 0, 0] },
    setup(sim) {
      const sc = this;
      sim.hook('begin', (s, l, stage) => {
        if (l.id !== 'rack:TX1-H2-L2' || stage !== 'haul' || l.theft) return;
        l.theft = true; sc.at = s.t;
        s.after((l.t1 - s.t) * 0.4, () => {
          s.alert({ at: S('TX1'), label: 'Seal break', days: 8 });
          const lot = l.lot;
          if (s.mode === 'native') {
            s.detected(sc.title, s.t);
            s.log('Dispatcher', `ShipmentEvent: route anomaly + seal break on ${short(l)}; carrier and insurer alerted`, { sev: 'risk', line: l });
            s.extend(l, 'receive', 1);
            s.log('Registrar', `${short(l)} quarantined at receipt: attestation fails on 2 systems`, { sev: 'risk', line: l });
            lot.damaged = [0, 5].map(k => ({ k, days: s.phys(`theft|${k}`, [5, 7, 10]), why: 'counterfeit components' }));
          } else {
            lot.damaged = [0, 5].map(k => ({ k, days: s.adm(`theft|${k}`, [15, 20, 30]), why: 'counterfeit found at burn-in' }));
            lot.burnExtra = 5;
            s.hook('live', (x, rk) => { if (rk.lot === lot && !lot.found) { lot.found = true; x.detected(sc.title, sc.at); } });
          }
        });
      });
    },
  },
  {
    n: 12, title: 'ODM financial distress', at: 40, focus: P('ODM1'),
    model: 'Kestrel asks for prepayment and financial signals deteriorate; from day 60 its builds slow by 25 days. Native sees it at day 40 and a human chooses to finance work in progress and move unstarted lots to the alternate. Legacy notices missed dates.',
    detect: { native: 0.3, legacy: [30, 34, 41] },
    setup(sim) {
      const HIT = 60;
      sim.at(HIT, () => { if (!sim.odmSupported) sim.lines.filter(l => l.supId === 'ODM1' && sim.notShipped(l)).forEach(l => sim.extend(l, 'make', 25)); sim.flag('ODM1', 'risk', 'Production slowdown'); });
      const open = (s) => racks(s, l => l.supId === 'ODM1' && s.notShipped(l) && l.stage !== 'make');
      wire(sim, this, {
        onset: (s) => { s.flag('ODM1', 'warn', 'Financial distress signals'); s.alert({ at: P('ODM1'), label: 'ODM distress', sev: 'warn', days: 25 }); s.msg('Finance', 'EarlyPaymentOffer', 'ODM1', 'in', null, 'requests 30% prepayment'); },
        native: (s) => s.decide({ title: 'Support or exit Kestrel Systems', desk: 'Treasury Aide', why: 'Sayari corporate signals + payment-term request. Exposure cap reached.', rec: 'both',
          options: [{ id: 'both', label: 'Finance WIP ($4M SCF) + move unstarted lots', effect: (x) => { x.odmSupported = true; x.cost.premium += 0.3; open(x).forEach(l => x.resource(l, 'ODM2', 'cap exposure')); } },
            { id: 'exit', label: 'Exit: move unstarted lots only', effect: (x) => open(x).forEach(l => x.resource(l, 'ODM2', 'exit')) }] }),
      });
    },
  },
  {
    n: 13, title: 'Liquid-cooling quality escape', at: 70, focus: P('CDU'),
    model: 'An NCR trend shows fitting leaks on Fjordcool CDU lots. Native: the Quality Sentinel holds the lots and adds an inspection before commissioning. Legacy finds leaks during commissioning, then flushes, reworks and retests.',
    detect: { native: 0.2, legacy: [14, 20, 30] },
    setup(sim) {
      wire(sim, this, {
        onset: (s) => { s.flag('CDU', 'risk', 'Fitting leak NCR'); s.alert({ at: P('CDU'), label: 'Quality escape', days: 20 }); s.msg('Quality and change', 'QualityNotice', 'CDU', 'in', null, 'NCR: fitting leaks'); },
        native: (s) => s.halls.forEach(h => s.extendCooling(h, s.phys(`${h.id}|leakfix`, [3, 4, 6]))),
        legacy: (s) => s.halls.forEach(h => s.extendCooling(h, s.phys(`${h.id}|leakfix`, [3, 4, 6]) + s.adm(`${h.id}|leak`, [10, 14, 20]))),
      });
    },
  },
  {
    n: 14, title: 'Supplier cyber incident / firmware compromise', at: 135, focus: P('NET'),
    model: 'Arcspan discloses a compromised firmware build. Native: attestation drift is already flagged at receipt; affected switches are re-flashed in a rolling window without taking halls out of billing. Legacy hears by email bulletin, then audits and re-images, pausing billing.',
    detect: { native: 0.05, legacy: [7, 9, 14] },
    setup(sim) {
      wire(sim, this, {
        onset: (s) => { s.flag('NET', 'risk', 'Firmware compromise'); s.alert({ at: P('NET'), label: 'Firmware incident', days: 20 }); },
        native: (s) => {
          s.log('Registrar', 'Quarantine firmware image; block updates fleet-wide; rolling re-flash behind redundant spines', { sev: 'warn' });
          s.lines.filter(l => l.kind === 'switch' && !l.done).forEach(l => s.extend(l, 'receive', 0.5));
          s.decide({ title: 'Precautionary customer notification (firmware provenance incident)', desk: 'Conductor', why: 'Customer communications are human-owned.', rec: 'notify', options: [{ id: 'notify', label: 'Notify customers' }, { id: 'hold', label: 'Hold' }] });
        },
        legacy: (s) => {
          s.halls.filter(h => h.lots.some(lot => lot.state === 'live')).forEach(h => s.pause(h, s.adm(`${h.id}|reimage`, [2, 3, 5]), 'audit and re-image switches'));
          s.lines.filter(l => l.kind === 'switch' && !l.done).forEach(l => s.extend(l, 'receive', 2));
        },
      });
    },
  },
  {
    n: 15, title: 'Skilled-labour shortage at a site', at: 35, focus: S('NO1'),
    model: 'Electrical crews at Fjord-1 run 35% short. Native: the Project Controller sees schedule drift in daily reports and Envoy sends RFQs to six contractors; a human approves premium labour. Legacy sees it at the monthly review.',
    detect: { native: 0.5, legacy: [18, 21, 30] },
    setup(sim) {
      const site = () => sim.sites.find(s => s.id === 'NO1');
      const slow = (x, f) => { for (const h of site().halls) if (h.build.stage === 'build' && !h.build.done) x.extend(h.build, 'build', (h.build.t1 - x.t) * f); };
      const restore = (x) => x.after(x.phys('NO1|mobilise', [7, 10, 14]), () => { slow(x, -0.35 / 1.35); site().labour = 1; x.log('Project Controller', 'Fjord-1 crews back to plan', { sev: 'ok' }); });
      wire(sim, this, {
        onset: (s) => { slow(s, 0.35); site().labour = 1.35; s.alert({ at: S('NO1'), label: 'Labour shortage', sev: 'warn', days: 25 }); },
        native: (s) => {
          for (let i = 0; i < 3; i++) s.msg('Sourcing', 'RFQ', 'EPCE', 'out', null, `electrical crews (${i + 1}/6)`);
          s.decide({ title: 'Premium labour: travelling electrical crews, +$1.1M', desk: 'Project Controller', why: 'Restores Fjord-1 schedule; above mandate.', rec: 'approve', options: [{ id: 'approve', label: 'Approve', effect: (x) => { x.cost.premium += 1.1; restore(x); } }, { id: 'no', label: 'Decline' }] });
        },
        legacy: (s) => s.decide({ title: 'Premium labour', desk: 'Committee', why: '', rec: 'approve', latency: s.adm('no1committee', [5, 10, 14]), options: [{ id: 'approve', label: 'Approve', effect: (x) => { x.cost.premium += 1.1; restore(x); } }] }),
      });
    },
  },
  {
    n: 16, title: 'Natural hazard at our own site', at: 108, focus: S('TX1'),
    model: 'A severe storm with hail and flash flooding hits Prairie-1. Native: hazard feeds give 48 hours\u2019 warning; deliveries are held at the airport, on-dock lots are moved inside, outdoor work stands down. Legacy is caught with racks in the yard.',
    detect: { native: -2, legacy: [0.1, 0.2, 0.5] },
    setup(sim) {
      const AT = this.at, sc = this;
      const tx = () => sim.sites.find(s => s.id === 'TX1');
      sim.at(AT - 2, () => {
        if (sim.mode !== 'native') return;
        sim.detected(sc.title, AT);
        sim.gate({ id: 'STORM', stage: 'haul', label: 'held at airport for storm', desk: 'Dispatcher', match: (l) => l.site.id === 'TX1' });
        sim.at(AT + 1.5, () => sim.openGate('STORM'));
        sim.protected = true;
        sim.decide({ title: 'Site safety: stand down outdoor work 72 h, secure roof penetrations', desk: 'Conductor', why: 'Site safety decisions are human-owned.', rec: 'approve', options: [{ id: 'approve', label: 'Approve stand-down' }] });
      });
      sim.at(AT, () => {
        sim.alert({ at: S('TX1'), label: 'Severe storm', days: 6 });
        for (const h of tx().halls) if (h.build.stage === 'build' && !h.build.done) sim.extend(h.build, 'build', sim.protected ? 2 : 6);
        if (!sim.protected) {
          const exposed = sim.lines.find(l => l.kind === 'rack' && l.site.id === 'TX1' && (l.stage === 'haul' || (l.done && l.lot.state === 'pending')));
          if (exposed) { exposed.lot.damaged = [2, 3].map(k => ({ k, days: sim.adm(`storm|${k}`, [10, 14, 21]), why: 'water damage' })); sim.log('Returns', `${short(exposed)}: two systems water-damaged in the yard`, { sev: 'risk' }); }
          sim.detected(sc.title, AT);
        }
      });
    },
  },
];

export const scenarioByN = (n) => SCENARIOS.find(s => s.n === Number(n)) || SCENARIOS[0];
/** Scenario objects carry per-run state (trigger times), so hand each Sim its own copy. */
export const freshScenario = (n) => { const s = scenarioByN(n); return { ...s }; };
