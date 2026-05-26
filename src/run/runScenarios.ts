import type { Scenario } from "../scenario/types.js";
import type { ScenarioResult } from "../result/types.js";
import { runScenario, type RunScenarioOptions } from "./runScenario.js";

// Hard ceiling on parallel executors. The orchestrating AI may *request* fewer
// (its judgment), but the CLI never spawns more than this many `claude` processes
// at once — keeps API rate-limit / browser-tab-group contention bounded.
// (Verified: 10 parallel claude --chrome runs completed with 0 tab collisions.)
export const MAX_CONCURRENCY = 10;

// Resolve the effective concurrency: clamp the requested value into [1, MAX_CONCURRENCY],
// defaulting to min(scenarioCount, MAX) when nothing valid is requested.
export function clampConcurrency(requested: number | undefined, scenarioCount: number): number {
  const fallback = Math.max(1, Math.min(scenarioCount, MAX_CONCURRENCY));
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.max(1, Math.min(Math.floor(requested), MAX_CONCURRENCY));
}

// Run scenarios with a bounded worker pool. Each scenario spawns its own executor
// process (via runScenario → spawnExecutor); `concurrency` caps how many run at once.
// Results keep input order regardless of completion order.
export async function runScenarios(
  scenarios: Scenario[],
  opts: RunScenarioOptions,
  concurrency: number
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = new Array(scenarios.length);
  const workers = Math.max(1, Math.min(concurrency, scenarios.length || 1));
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < scenarios.length; i = next++) {
      results[i] = await runScenario(scenarios[i], opts);
    }
  };
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
