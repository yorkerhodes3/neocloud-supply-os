import { Sim } from '../sim/engine.js';
import { freshScenario } from '../sim/scenarios.js';
import {
  REGULATION_DEFAULTS, REGULATION_SOURCES, STUDENT_TEMPLATE,
  validateRegulation, validateStudentAnalysis, regulationExposure, planningDate,
} from '../sim/regulation.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fields = {
  title: 'regTitle', status: 'regStatus', startDate: 'regStart', signalDay: 'regSignal',
  effectiveDay: 'regEffective', generation: 'regGeneration', minimumGeneration: 'regMinimum',
  scope: 'regScope', exemptionPct: 'regExemption', qualificationDays: 'regQualification', premiumPct: 'regPremium',
};
const numeric = new Set(['signalDay', 'effectiveDay', 'qualificationDays', 'premiumPct', 'exemptionPct']);

export function mountRegulationPanel({ getState, apply, initialError = '' }) {
  const $ = id => document.getElementById(id);
  const error = message => { $('regError').textContent = message; $('regError').hidden = !message; };
  const fill = config => {
    for (const [key, id] of Object.entries(fields)) $(id).value = config[key] ?? '';
  };
  fill(getState().config || REGULATION_DEFAULTS);
  error(initialError);
  $('regSources').innerHTML = REGULATION_SOURCES.map(s => `<li><a class="inline" href="${esc(s.url)}">${esc(s.title)}</a><br><b>${esc(s.basis)}.</b> ${esc(s.note)}</li>`).join('');

  $('regulationForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = { version: 1 };
    for (const [key, id] of Object.entries(fields)) {
      const value = $(id).value;
      input[key] = key === 'exemptionPct' && value === '' ? null : numeric.has(key) ? Number(value) : value;
    }
    try {
      const config = validateRegulation(input);
      error('');
      apply(config, getState().analysis);
    } catch (err) { error(err.message); }
  });
  $('regRemove').addEventListener('click', () => { error(''); apply(null, getState().analysis); });
  $('regTemplate').addEventListener('click', () => { $('regAnalysis').value = JSON.stringify(STUDENT_TEMPLATE, null, 2); });
  $('regImport').addEventListener('click', () => {
    try {
      const raw = $('regAnalysis').value;
      if (raw.length > 20000) throw new Error('Student analysis exceeds 20,000 characters.');
      const analysis = validateStudentAnalysis(JSON.parse(raw));
      if (!getState().config) throw new Error('Inject a planning scenario before applying findings.');
      error('');
      apply(getState().config, analysis);
    } catch (err) { error(`Findings not applied: ${err.message}`); }
  });
  $('regClear').addEventListener('click', () => {
    $('regAnalysis').value = '';
    error('');
    apply(getState().config, null);
  });

  function render() {
    const { config, analysis, cfg, projections, provider } = getState();
    $('regRemove').disabled = !config;
    $('regState').textContent = config
      ? `Injected: ${config.title} (${config.status}, simulation only). Day 0 = ${config.startDate}; signal ${planningDate(config, config.signalDay)}; assumed enforcement ${planningDate(config, config.effectiveDay)}. Original scenario S${cfg.scenario} remains active.`
      : 'No regulation injected. The simulation above uses the original scenario only.';
    $('regAnalysisState').textContent = analysis
      ? `Applied ${analysis.analysisId}, as of ${analysis.asOf}: ${analysis.parts.length} site finding(s). Private browser-memory branch; sharing disabled.`
      : 'Using synthetic manufacturing/BOM fixtures, not real company data.';
    $('link').disabled = !!analysis;
    $('link').title = analysis ? 'Clear student findings before sharing; findings are never embedded in a URL.' : 'Copy a reproducible run link';
    if (!config) {
      $('regExposure').textContent = 'Inject the proposal to see affected lots, unknowns and same-seed deployment differences.';
      $('regImpact').innerHTML = '';
      return;
    }
    const exposure = regulationExposure(projections.native, config, analysis);
    $('regExposure').innerHTML = `<p><b>${exposure.counts.affected} affected</b> / ${exposure.counts.unknown} unknown / ${exposure.counts.exempt} exempt / ${exposure.counts['out-of-scope']} out-of-scope optics lots. ${exposure.gpus.toLocaleString('en-US')} GPUs depend on affected or unknown lots ($${exposure.valueM.toFixed(1)}M optics value, not rack value).</p>
      <ul class="plain">${exposure.sites.map(s => `<li><b>${esc(s.site.name)}: ${esc(s.status)}</b> (${s.lots} lots) — ${esc(s.finding.partNumber)}, ${esc(s.finding.manufacturer)}, ${esc(s.finding.generation)}. ${esc(s.reason)}</li>`).join('')}</ul>`;
    const rows = [];
    for (const mode of ['native', 'legacy']) {
      const base = new Sim({
        seed: cfg.seed, mode, scenario: freshScenario(cfg.scenario), autoResolve: true,
        policy: cfg.policy, autonomy: cfg.autonomy, provider,
      });
      base.advanceTo(240);
      const a = base.kpis(240), b = projections[mode].kpis(240);
      const day = v => v === null ? 'not by day 240' : `day ${v.toFixed(1)}`;
      const change = b.allLive !== null && a.allLive !== null ? `${(b.allLive - a.allLive).toFixed(1)} d` : 'not measurable within window';
      const costDelta = b.premiumM + b.tariffM + b.expediteM - a.premiumM - a.tariffM - a.expediteM;
      rows.push(`<tr><td>${mode === 'native' ? 'Agent-native' : 'Legacy'}</td><td>${day(a.allLive)}</td><td>${day(b.allLive)}</td><td>${change}</td><td>${Math.round(b.lateRackDays - a.lateRackDays).toLocaleString('en-US')}</td><td>$${costDelta.toFixed(2)}M</td><td>$${(b.revenueM - a.revenueM).toFixed(2)}M</td></tr>`);
    }
    $('regImpact').innerHTML = `<caption class="tiny">Day 240: with proposal minus without proposal; costs and revenue are illustrative.</caption><thead><tr><th>Run</th><th>Without proposal: all billable</th><th>With proposal</th><th>Schedule delta</th><th>Late rack-days delta</th><th>Premium/tariff/expedite delta</th><th>Revenue delta</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  }
  return { render };
}
