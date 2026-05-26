import type { Scenario } from "../scenario/types.js";
import type { Environment, ScenarioResult } from "../result/types.js";
import { buildUserPrompt, SYSTEM_CONTRACT } from "./buildPrompt.js";
import { spawnExecutor, type Runner } from "./spawnExecutor.js";
import { parseExecutorResult } from "../result/parseExecutorResult.js";

export interface RunScenarioOptions {
  runId: string;
  targets: { frontend: string };
  model: string;
  env: Environment;
  resolveValue: (v: string) => string;   // secrets resolver (injected)
  runner?: Runner;
  now?: () => Date;
}

export async function runScenario(scenario: Scenario, opts: RunScenarioOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now();
  const envelope = await spawnExecutor(
    {
      prompt: buildUserPrompt(scenario, opts.targets, opts.resolveValue),
      systemPrompt: SYSTEM_CONTRACT,
      model: opts.model,
    },
    opts.runner
  );
  const parsed = parseExecutorResult(envelope.result);
  return {
    run_id: opts.runId,
    scenario_id: scenario.id,
    status: parsed.status,
    not_tested_reason: parsed.not_tested_reason,
    pattern_inference: parsed.pattern_inference,
    evidence: parsed.evidence,
    started_at: startedAt.toISOString(),
    duration_ms: now().getTime() - startedAt.getTime(),
    steps: (parsed.steps as any) ?? [],
    environment: opts.env,
    handoff_notes: parsed.handoff_notes,
    raw_executor_text: parsed.raw_executor_text,
  };
}
