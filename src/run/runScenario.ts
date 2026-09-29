import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import type { Scenario } from "../scenario/types.js";
import type { Environment, ScenarioResult, StepResult } from "../result/types.js";
import { collectScreenshots, type ScreenshotFs } from "../result/collectScreenshots.js";
import { buildUserPrompt, SYSTEM_CONTRACT, type PromptTargets } from "./buildPrompt.js";
import { spawnExecutor, type StreamSpawner } from "./spawnExecutor.js";
import { parseExecutorResult, PARSE_FAILED_REASON } from "../result/parseExecutorResult.js";
import type { ReportedStep, ResultMeta, PermissionDenied } from "./streamParser.js";
import { initWarnings, pinWarnings, repeatedClickWarning } from "./assembleWarnings.js";

export interface RunScenarioOptions {
  runId: string;
  targets: PromptTargets;
  model: string;
  effort?: string;
  env: Environment;
  resolveValue: (v: string) => string;
  now?: () => Date;
  timeoutMs?: number;
  spawner?: StreamSpawner;            // injected for tests
  logLine?: (line: string) => void;  // per-line log sink
  executorLog?: string;              // log file path (result metadata)
  resultDir?: string;                // run output dir; screenshots are copied under it
  screenshotFs?: ScreenshotFs;       // injected for tests
  previousClaudeCodeVersion?: string; // from the last run's summary, for the version-change warning
}

const defaultScreenshotFs: ScreenshotFs = {
  mkdir: (d) => { mkdirSync(d, { recursive: true }); },
  copy: (s, d) => { copyFileSync(s, d); },
};

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

// The stream's permission_denied events carry the CLI's own reason (e.g. "requires approval, and this
// session has no approval surface") — that beats the 2026-08-05 guess below, which stays only for
// logs that predate the event.
export function chromeDenialReason(deniedTools: string[], denied: PermissionDenied[] = [], model?: string): string | undefined {
  // A killed run has no result event (so no permission_denials); the stream's denial events still name the tools.
  const names = [...new Set(
    [...deniedTools, ...denied.map((d) => d.tool)]
      .filter((t) => t.startsWith(CHROME_TOOL_PREFIX)).map((t) => t.slice(CHROME_TOOL_PREFIX.length))
  )];
  if (!names.length) return undefined;
  const reason = denied.find((d) => d.tool.startsWith(CHROME_TOOL_PREFIX) && d.reason)?.reason;
  if (reason) return `claude-in-chrome denied the executor (${names.join(", ")}) — ${reason}`;
  // The haiku approval gate is the measured cause only when the executor IS haiku; a denial on another model
  // (e.g. after its tab vanished) must not send the planner chasing the model.
  if (!model || /haiku/i.test(model))
    return `claude-in-chrome denied the executor (${names.join(", ")}) — re-running as-is will fail the same way. First check runner.model: as of 2026-08-05 a haiku executor was denied every browser tool while sonnet and opus passed with identical flags (reproduced, though no public doc states a model requirement — it may be a bug). If the model is already sonnet/opus, check that the extension is connected and that only your own Chrome is (list_connected_browsers reports every browser on this account).`;
  return `claude-in-chrome denied the executor (${names.join(", ")}) — check that the extension is connected and that only your own Chrome is (list_connected_browsers reports every browser on this account); re-running as-is will fail the same way.`;
}

export function errorResultReason(meta: ResultMeta | undefined): string | undefined {
  if (!meta?.isError) return undefined;
  const detail = meta.errors?.length ? `: ${meta.errors.join("; ")}` : "";
  return `${meta.subtype ?? "error"}${detail}`;
}

// index is the 1-based step number shown in the prompt. An index outside the scenario is kept with
// action "?" rather than dropped — the report is still evidence of what the executor believed it did.
export function stepsFromReports(reported: ReportedStep[], scenario: Scenario): StepResult[] {
  return reported.map((r) => {
    const step: StepResult = { index: r.index, action: scenario.steps[r.index - 1]?.action ?? "?", status: r.status };
    if (r.note !== undefined) step.note = r.note;
    return step;
  });
}

// A fresh tab drops click/type until it has been screenshotted once, and the tool still reports
// success — so the run reads as "wrong password" or "button does nothing" instead of "input lost".
// The runner cannot drive the browser itself, so it names what it saw rather than fixing it.
export const WARMUP_WARNING =
  "the executor clicked or typed before this tab's first screenshot — a fresh tab silently drops those inputs, so an early step may have done nothing even though the tool reported success. Any failure below may be this, not the app.";

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

  const denialReason = chromeDenialReason(state.deniedTools, state.permissionDenied, opts.model);
  const pinWarn = pinWarnings(state.browserPin, state.tabsBeforePin, opts.targets.browserDeviceId);
  const clickWarn = repeatedClickWarning(state.repeatedClicks);
  const warnings = [
    ...(state.inputBeforeScreenshot ? [WARMUP_WARNING] : []),
    ...initWarnings(state.init, opts.previousClaudeCodeVersion, hasUpload(scenario) ? ["Read"] : []),
    ...pinWarn,
    ...(clickWarn ? [clickWarn] : []),
  ];
  const reportedSteps = stepsFromReports(state.reportedSteps, scenario);
  // SKIPPED is reserved for optional steps. An executor that skips a mandatory step (measured: "already
  // logged in, skipping the login form") has not verified what the scenario asserts, so its PASS is a PARTIAL.
  const skippedMandatory = reportedSteps
    .filter((s) => s.status === "SKIPPED" && !scenario.steps[s.index - 1]?.optional)
    .map((s) => s.index);
  if (skippedMandatory.length)
    warnings.push(`executor reported non-optional step(s) as SKIPPED: ${skippedMandatory.join(", ")} — a PASS with skipped mandatory steps is downgraded to PARTIAL`);
  const common = {
    run_id: opts.runId, scenario_id: scenario.id,
    started_at: startedAt.toISOString(), duration_ms: now().getTime() - startedAt.getTime(),
    environment: opts.env,
    last_tool: state.lastTool, tool_count: state.toolCount, executor_log: opts.executorLog,
    denied_tools: state.deniedTools.length ? state.deniedTools : undefined,
    warnings: warnings.length ? warnings : undefined,
    claude_code_version: state.init?.claudeCodeVersion,
    browser_pin: state.browserPin,
  };
  const collect = (shots: string[]) => {
    const out = opts.resultDir
      ? collectScreenshots(shots, join(opts.resultDir, scenario.id), opts.screenshotFs ?? defaultScreenshotFs)
      : shots;
    return out.length ? out : undefined;
  };
  const pinFailure = state.browserPin?.ok === false ? pinWarn[0] : undefined;

  // 1. The executor reported through the tester tools: that is the verdict.
  if (state.finalReport) {
    const f = state.finalReport;
    const notTested = f.status === "NOT_TESTED";
    const status = f.status === "PASS" && skippedMandatory.length ? "PARTIAL" : f.status;
    // The executor's own reason is structured here (not prose), so it leads; a denial or pin failure is appended.
    const extra = denialReason ?? pinFailure;
    const ownReason = f.not_tested_reason && extra ? `${f.not_tested_reason} — also: ${extra}` : f.not_tested_reason ?? extra;
    return {
      ...common, status, screenshots: collect(f.screenshots ?? []),
      not_tested_reason: notTested ? ownReason : f.not_tested_reason,
      evidence: f.evidence, steps: reportedSteps, handoff_notes: f.handoff_notes, reported_via: "tool",
    };
  }

  // 2. No verdict: killed, an error-type result, or a normal exit that never called report_final.
  const text = envelope?.result.trim() ?? "";
  const endedSilently = envelope && !killedReason
    ? `the executor ended without report_final${state.lastTool ? ` — last tool '${state.lastTool}' (${state.toolCount} calls)` : ""}`
    : notTestedReason(killedReason, state.lastTool, state.toolCount);
  if (!envelope || killedReason || state.resultMeta?.isError || !text) {
    const reason = denialReason ?? pinFailure ?? errorResultReason(state.resultMeta) ?? endedSilently;
    return { ...common, status: "NOT_TESTED", not_tested_reason: reason, steps: reportedSteps, reported_via: reportedSteps.length ? "tool" : undefined };
  }

  // 3. Text fallback — the pre-tool contract, and executors that ignore the reporting rule.
  const parsed = parseExecutorResult(envelope.result);
  const notTested = parsed.status === "NOT_TESTED";
  // A prose-only last message is the missing report_final, not a JSON problem: name that cause.
  const textReason = parsed.not_tested_reason === PARSE_FAILED_REASON ? endedSilently : parsed.not_tested_reason;
  return {
    ...common, status: parsed.status, screenshots: collect(parsed.screenshots ?? []),
    not_tested_reason: notTested ? denialReason ?? pinFailure ?? textReason : parsed.not_tested_reason,
    pattern_inference: parsed.pattern_inference, evidence: parsed.evidence,
    steps: reportedSteps.length ? reportedSteps : ((parsed.steps as StepResult[] | undefined) ?? []),
    handoff_notes: parsed.handoff_notes,
    raw_executor_text: parsed.raw_executor_text, parse_repaired: parsed.parse_repaired, reported_via: "text",
  };
}
