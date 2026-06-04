import type { Scenario } from "../scenario/types.js";
import type { Environment, ScenarioResult } from "../result/types.js";
import { buildUserPrompt, SYSTEM_CONTRACT } from "./buildPrompt.js";
import { spawnExecutor, type StreamSpawner } from "./spawnExecutor.js";
import { parseExecutorResult } from "../result/parseExecutorResult.js";

export interface RunScenarioOptions {
  runId: string;
  targets: { frontend: string };
  model: string;
  env: Environment;
  resolveValue: (v: string) => string;
  now?: () => Date;
  timeoutMs?: number;
  spawner?: StreamSpawner;            // injected for tests
  logLine?: (line: string) => void;  // per-line log sink
  executorLog?: string;              // log file path (result metadata)
}

// Maps the executor's kill cause + last observed tool into a NOT_TESTED reason string.
export function notTestedReason(
  killedReason: "stall" | "timeout" | "groping" | undefined,
  lastTool: string | undefined,
  toolCount: number
): string {
  const why =
    killedReason === "stall" ? "무응답(스톨)"
    : killedReason === "timeout" ? "하드 타임아웃"
    : killedReason === "groping" ? "같은 도구 반복(groping) — 셀렉터가 안 맞아 한 요소를 계속 더듬음(첫 시도 미스)"
    : "executor가 결과를 방출하지 않음";
  const lastBit = lastTool ? ` — 마지막 도구 '${lastTool}' (호출 ${toolCount}회)` : " — 도구 호출 0회";
  return `${why}${lastBit}`;
}

export async function runScenario(scenario: Scenario, opts: RunScenarioOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now();

  const { envelope, state, killedReason } = await spawnExecutor(
    { prompt: buildUserPrompt(scenario, opts.targets, opts.resolveValue), systemPrompt: SYSTEM_CONTRACT, model: opts.model },
    { spawner: opts.spawner, logLine: opts.logLine, timeoutMs: opts.timeoutMs }
  );

  const common = {
    run_id: opts.runId, scenario_id: scenario.id,
    started_at: startedAt.toISOString(), duration_ms: now().getTime() - startedAt.getTime(),
    environment: opts.env,
    last_tool: state.lastTool, tool_count: state.toolCount, executor_log: opts.executorLog,
  };

  if (!envelope) {
    return {
      ...common, status: "NOT_TESTED",
      not_tested_reason: notTestedReason(killedReason, state.lastTool, state.toolCount), steps: [],
    };
  }

  const parsed = parseExecutorResult(envelope.result);
  return {
    ...common, status: parsed.status, not_tested_reason: parsed.not_tested_reason,
    pattern_inference: parsed.pattern_inference, evidence: parsed.evidence,
    steps: (parsed.steps as any) ?? [], handoff_notes: parsed.handoff_notes,
    raw_executor_text: parsed.raw_executor_text,
  };
}
