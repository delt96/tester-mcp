import type { Scenario } from "../scenario/types.js";
import type { Environment, ScenarioResult } from "../result/types.js";
import { buildUserPrompt, SYSTEM_CONTRACT } from "./buildPrompt.js";
import { spawnExecutor, type StreamSpawner } from "./spawnExecutor.js";
import { parseExecutorResult } from "../result/parseExecutorResult.js";

export interface RunScenarioOptions {
  runId: string;
  targets: { frontend: string };
  model: string;
  effort?: string;
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
    killedReason === "stall" ? "stalled (no events)"
    : killedReason === "timeout" ? "hard timeout"
    : killedReason === "groping" ? "groping — the same tool ran over and over on one element, so the selector is wrong (it missed on the first try)"
    : "the executor never emitted a result";
  const lastBit = lastTool ? ` — last tool '${lastTool}' (${toolCount} calls)` : " — 0 tool calls";
  return `${why}${lastBit}`;
}

const CHROME_TOOL_PREFIX = "mcp__claude-in-chrome__";

// Every chrome tool except the read-only list_connected_browsers comes back "Claude in Chrome
// requires permission", recorded under permission_denials. Measured 2026-08-05: the trigger is the
// executor's MODEL — haiku is denied, sonnet/opus pass with identical flags (undocumented; the
// public docs list no model requirement). The executor's prose reply also fails JSON parsing,
// which used to mask this as "output JSON parse failure". Name the real cause instead.
export function chromeDenialReason(deniedTools: string[]): string | undefined {
  const names = [...new Set(
    deniedTools.filter((t) => t.startsWith(CHROME_TOOL_PREFIX)).map((t) => t.slice(CHROME_TOOL_PREFIX.length))
  )];
  if (!names.length) return undefined;
  return `claude-in-chrome denied the executor (${names.join(", ")}) — re-running as-is will fail the same way. First check runner.model: as of 2026-08-05 a haiku executor was denied every browser tool while sonnet and opus passed with identical flags (reproduced, though no public doc states a model requirement — it may be a bug). If the model is already sonnet/opus, check that the extension is connected and that only your own Chrome is (list_connected_browsers reports every browser on this account).`;
}

// file_upload only accepts paths the executor session may read, so upload scenarios need Read.
export function hasUpload(scenario: Scenario): boolean {
  return scenario.steps.some((s) => s.action === "upload");
}

export async function runScenario(scenario: Scenario, opts: RunScenarioOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now();

  const { envelope, state, killedReason } = await spawnExecutor(
    { prompt: buildUserPrompt(scenario, opts.targets, opts.resolveValue), systemPrompt: SYSTEM_CONTRACT, model: opts.model, effort: opts.effort, allowRead: hasUpload(scenario) },
    { spawner: opts.spawner, logLine: opts.logLine, timeoutMs: opts.timeoutMs }
  );

  const denialReason = chromeDenialReason(state.deniedTools);
  const common = {
    run_id: opts.runId, scenario_id: scenario.id,
    started_at: startedAt.toISOString(), duration_ms: now().getTime() - startedAt.getTime(),
    environment: opts.env,
    last_tool: state.lastTool, tool_count: state.toolCount, executor_log: opts.executorLog,
    denied_tools: state.deniedTools.length ? state.deniedTools : undefined,
  };

  if (!envelope) {
    return {
      ...common, status: "NOT_TESTED",
      not_tested_reason: denialReason ?? notTestedReason(killedReason, state.lastTool, state.toolCount), steps: [],
    };
  }

  const parsed = parseExecutorResult(envelope.result);
  // A denial mid-run doesn't invalidate a verdict the executor still reached — only relabel NOT_TESTED.
  const notTested = parsed.status === "NOT_TESTED";
  return {
    ...common, status: parsed.status,
    not_tested_reason: notTested ? denialReason ?? parsed.not_tested_reason : parsed.not_tested_reason,
    pattern_inference: parsed.pattern_inference, evidence: parsed.evidence,
    steps: (parsed.steps as any) ?? [], handoff_notes: parsed.handoff_notes,
    raw_executor_text: parsed.raw_executor_text,
  };
}
