import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATUSES, type ScenarioResult, type RunSummary, type Status } from "./types.js";

export function writeScenarioResult(runDir: string, result: ScenarioResult): string {
  mkdirSync(runDir, { recursive: true });
  const p = join(runDir, `${result.scenario_id}.json`);
  writeFileSync(p, JSON.stringify(result, null, 2), "utf8");
  return p;
}

export function writeSummary(runDir: string, runId: string, startedAt: string, results: ScenarioResult[]): string {
  mkdirSync(runDir, { recursive: true });
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const r of results) byStatus[r.status]++;
  const summary: RunSummary = {
    run_id: runId, started_at: startedAt, total: results.length, by_status: byStatus,
    scenarios: results.map((r) => ({ scenario_id: r.scenario_id, status: r.status })),
    claude_code_version: results.find((r) => r.claude_code_version)?.claude_code_version,
  };
  const p = join(runDir, "summary.json");
  writeFileSync(p, JSON.stringify(summary, null, 2), "utf8");
  return p;
}
