// Paired coordination trials: the physical world stays fixed, only latency seeds change.
import { Sim, REPORT_DAY, COORDINATION } from './engine.js';
import { freshScenario } from './scenarios.js';
import { hashSeed } from '../lib/rng.js';

export const MONTE_CARLO_RUNS = 50;

export function runLatencyTrial({ seed = 42, scenario = 0, policy = 'jit', autonomy = 'earned', horizon = 240, provider, trial = 0 } = {}) {
  const latencySeed = trial === 0 ? seed : hashSeed(`${seed}|latency-trial|${trial}`);
  const result = { trial, latencySeed };
  for (const mode of ['native', 'legacy']) {
    const s = new Sim({ seed, latencySeed, mode, scenario: freshScenario(scenario), policy, autonomy, horizon, provider, autoResolve: true });
    s.advanceTo(horizon);
    const k = s.kpis(horizon);
    result[mode] = { firstLive: k.firstLive, allLive: k.allLive, revenueM: s.kpis(REPORT_DAY).revenueM, series: s.series, latencies: s.latencies };
  }
  return result;
}

/** Empirical nearest-rank percentiles; null completion times are right-censored, not dropped. */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.map(v => v == null ? Infinity : v).sort((a, b) => a - b);
  const value = sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return Number.isFinite(value) ? value : null;
}
const spread = values => ({ p10: percentile(values, 0.1), p50: percentile(values, 0.5), p90: percentile(values, 0.9) });

export function summarizeLatencyTrials(trials) {
  if (!trials.length) throw new Error('Monte Carlo requires at least one paired trial');
  const result = { runs: trials.length, modes: {}, tasks: [], trials: [] };
  for (const mode of ['native', 'legacy']) {
    const runs = trials.map(t => t[mode]);
    result.modes[mode] = {
      firstLive: spread(runs.map(r => r.firstLive)),
      allLive: spread(runs.map(r => r.allLive)),
      revenueM: spread(runs.map(r => r.revenueM)),
      completed: runs.filter(r => r.allLive != null).length,
      series: runs[0].series.map(({ d }, i) => ({ d, ...spread(runs.map(r => r.series[i].gpus)) })),
    };
    const samples = runs.flatMap(r => r.latencies);
    for (const [task, { label }] of Object.entries(COORDINATION.tasks)) {
      const waits = samples.filter(s => s.task === task);
      if (!waits.length) continue;
      result.tasks.push({
        mode, task, label, count: waits.length, ...spread(waits.map(s => s.days)),
        min: Math.min(...waits.map(s => s.days)), max: Math.max(...waits.map(s => s.days)),
        regimes: Object.fromEntries(COORDINATION.regimes.map(r => [r.id, waits.filter(s => s.regime === r.id).length])),
      });
    }
  }
  result.trials = trials.map(({ trial, latencySeed, native, legacy }) => ({
    trial, latencySeed,
    native: { firstLive: native.firstLive, allLive: native.allLive, revenueM: native.revenueM },
    legacy: { firstLive: legacy.firstLive, allLive: legacy.allLive, revenueM: legacy.revenueM },
  }));
  return result;
}
