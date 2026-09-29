import type { InitInfo, BrowserPin, RepeatedClick } from "./streamParser.js";
import { TESTER_SERVER } from "./executorTools.js";

// Built-in tools a 2.1.283 executor is offered under the current deny list (measured 2026-09-28),
// plus StructuredOutput (--json-schema). Anything else is a new leak worth a look.
export const KNOWN_BUILTIN_TOOLS: readonly string[] = [
  "CronCreate", "CronDelete", "CronList", "DesignSync", "EnterWorktree", "ExitWorktree", "ListAgents", "Monitor",
  "PushNotification", "RemoteTrigger", "ReportFindings", "ScheduleWakeup", "SendMessage", "TaskStop", "ToolSearch", "Workflow",
  "StructuredOutput",
];

// extraKnown: tools the runner opened on purpose for this scenario (Read for uploads).
export function initWarnings(init: InitInfo | undefined, previousVersion: string | undefined, extraKnown: readonly string[] = []): string[] {
  if (!init) return [];
  const out: string[] = [];
  const unknown = init.builtinTools.filter((t) => !KNOWN_BUILTIN_TOOLS.includes(t) && !extraKnown.includes(t));
  if (unknown.length)
    out.push(`executor was offered built-in tools outside the known set: ${unknown.join(", ")} — deny them or adopt --tools`);
  const tester = init.mcpServers.find((s) => s.name === TESTER_SERVER);
  if (!tester || tester.status !== "connected")
    out.push("tester tool server not connected — the permission gate handler and step reports are off for this run");
  if (previousVersion && init.claudeCodeVersion && init.claudeCodeVersion !== previousVersion)
    out.push(`Claude Code changed ${previousVersion} → ${init.claudeCodeVersion} since the last run; flag semantics may have moved`);
  return out;
}

export function pinWarnings(pin: BrowserPin | undefined, tabsBeforePin: boolean, requested: string | undefined): string[] {
  if (!requested) return [];
  if (!pin) return tabsBeforePin ? ["executor did not pin the browser before touching tabs — it may have driven another machine's Chrome"] : [];
  const out: string[] = [];
  if (pin.ok === false) out.push(`browser pin failed: ${pin.error ?? "select_browser errored"}`);
  if (pin.requested && pin.requested !== requested) out.push(`executor pinned "${pin.requested}" but the config says "${requested}"`);
  if (tabsBeforePin) out.push("executor touched tabs before pinning the browser");
  return out;
}

export function repeatedClickWarning(clicks: RepeatedClick[]): string | undefined {
  if (!clicks.length) return undefined;
  const calls = clicks.map((c) => `#${c.call}`).join(", ");
  return `clicked the same target again ${clicks.length} time(s) (calls ${calls}) — a repeated click on a save/submit button may have duplicated a record`;
}
