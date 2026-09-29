import { describe, it, expect } from "vitest";
import { runScenario, notTestedReason, chromeDenialReason, hasUpload } from "../../src/run/runScenario.js";
import type { Scenario } from "../../src/scenario/types.js";
import type { StreamSpawner } from "../../src/run/spawnExecutor.js";

const scenario: Scenario = { id: "s1", title: "t", locale: "ru", steps: [{ action: "navigate", url: "/" }] };
const base = {
  runId: "RID", targets: { frontend: "http://x" }, model: "haiku",
  env: { node_version: "v20", os: "win32", runner_model: "haiku" },
  resolveValue: (v: string) => v, now: () => new Date("2026-05-26T00:00:00Z"),
};
const okResult = JSON.stringify({ type: "result", result: '```json\n{"status":"PASS","evidence":["ok"]}\n```' });
const tool = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "navigate" }] } });

describe("notTestedReason", () => {
  it("groping: the reason explains groping and names the last tool", () => {
    const r = notTestedReason("groping", "find", 25);
    expect(r).toMatch(/groping/);
    expect(r).toMatch(/find/);
  });
  it("keeps the stall/timeout/undefined mapping", () => {
    expect(notTestedReason("stall", "navigate", 1)).toMatch(/stalled/);
    expect(notTestedReason("timeout", undefined, 0)).toMatch(/timeout/);
    expect(notTestedReason(undefined, undefined, 0)).toMatch(/never emitted/);
  });
});

describe("chromeDenialReason", () => {
  it("names the denied chrome tools and points at the extension", () => {
    const r = chromeDenialReason([
      "mcp__claude-in-chrome__tabs_context_mcp", "mcp__claude-in-chrome__tabs_create_mcp",
    ]);
    expect(r).toMatch(/claude-in-chrome/);
    expect(r).toMatch(/tabs_context_mcp/);
    expect(r).toMatch(/haiku/);                     // the measured trigger, named first
    expect(r).toMatch(/list_connected_browsers/);   // fallback check if the model is fine
  });
  it("dedupes repeated denials of the same tool", () => {
    const r = chromeDenialReason(["mcp__claude-in-chrome__find", "mcp__claude-in-chrome__find"]);
    expect(r!.match(/find/g)).toHaveLength(1);
  });
  it("ignores non-chrome denials", () => {
    expect(chromeDenialReason(["Bash", "Write"])).toBeUndefined();
    expect(chromeDenialReason([])).toBeUndefined();
  });
});

describe("runScenario (streaming)", () => {
  it("happy path: PASS with last_tool/tool_count recorded", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onLine(okResult); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.last_tool).toBe("navigate");
    expect(r.tool_count).toBe(1);
  });
  it("no envelope: NOT_TESTED, and the reason names the last tool", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onClose(null, "SIGTERM"); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/navigate/);
    expect(r.last_tool).toBe("navigate");
  });
  it("chrome tools denied → NOT_TESTED reason blames the extension, not JSON parsing", async () => {
    // Real 8/5 shape: executor emits prose ("permission required"), so JSON parsing fails too —
    // the denial is the actual cause and must win over the generic parse-failure reason.
    const denied = JSON.stringify({ type: "result", result: "Claude in Chrome requires permission — may I proceed?",
      permission_denials: [{ tool_name: "mcp__claude-in-chrome__tabs_context_mcp", tool_input: {} }] });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onLine(denied); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/claude-in-chrome/);
    expect(r.not_tested_reason).not.toMatch(/parse/);
    expect(r.denied_tools).toEqual(["mcp__claude-in-chrome__tabs_context_mcp"]);
  });
  it("denial while the run still succeeds → status kept, denied_tools recorded", async () => {
    // Mid-run denials happen (form_input/javascript_tool) without killing the run; don't rewrite PASS.
    const passWithDenial = JSON.stringify({ type: "result", result: '```json\n{"status":"PASS"}\n```',
      permission_denials: [{ tool_name: "mcp__claude-in-chrome__form_input", tool_input: {} }] });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onLine(passWithDenial); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.not_tested_reason).toBeUndefined();
    expect(r.denied_tools).toEqual(["mcp__claude-in-chrome__form_input"]);
  });
  it("killed with a chrome denial → denial reason wins over the kill reason", async () => {
    const denied = JSON.stringify({ type: "result", result: "x",
      permission_denials: [{ tool_name: "mcp__claude-in-chrome__tabs_create_mcp", tool_input: {} }] });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(denied); h.onClose(null, "SIGTERM"); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.not_tested_reason).toMatch(/claude-in-chrome/);
  });
  it("a verdict salvaged from malformed JSON reaches the result, flagged as repaired", async () => {
    const brokenSteps = JSON.stringify({ type: "result",
      result: '```json\n{"status":"PASS","evidence":["ok"],"steps":[{"index": 35-36,"action":"click","status":"PASS"}]}\n```' });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onLine(brokenSteps); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.parse_repaired).toBe(true);
    expect(r.evidence).toEqual(["ok"]);
  });
  it("collects the executor's screenshots into the run directory", async () => {
    const withShot = JSON.stringify({ type: "result",
      result: '```json\n{"status":"PASS","screenshots":["/tmp/a.png"]}\n```' });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(withShot); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, {
      ...base, spawner, logLine: () => {},
      resultDir: "runs/RID",
      screenshotFs: { mkdir: () => {}, copy: () => {} },
    });
    expect(r.screenshots?.[0]).toMatch(/runs[/\\]RID[/\\]s1[/\\]a\.png$/);
  });
  it("leaves screenshots undefined when the executor reported none", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(okResult); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {}, resultDir: "runs/RID" });
    expect(r.screenshots).toBeUndefined();
  });
  it("envelope present but output is malformed: NOT_TESTED, last_tool kept", async () => {
    const natural = JSON.stringify({ type: "result", result: "prose only — no JSON" });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onLine(natural); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.last_tool).toBe("navigate");   // the common spread applies on the parse-NOT_TESTED path too
  });
});

describe("hasUpload", () => {
  it("is true only when a step uploads a file", () => {
    const base = { id: "s", title: "t", on_failure: "stop" as const };
    expect(hasUpload({ ...base, steps: [{ action: "navigate", url: "/" }] })).toBe(false);
    expect(hasUpload({
      ...base,
      steps: [{ action: "navigate", url: "/" }, { action: "upload", target: { css: "input" }, file: "C:\\fx\\d.pdf" }],
    })).toBe(true);
  });
});

const three: Scenario = { id: "s3", title: "t", locale: "ru", steps: [
  { action: "navigate", url: "/" }, { action: "click", target: { css: "#a" } }, { action: "assert_visible", target: { css: "#b" } },
] };
const useTool = (id: string, name: string, input: Record<string, unknown>) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const stepsReport = useTool("r1", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "SKIPPED", note: "absent" }, { index: 4, status: "PASS" }] });
const finalReport = useTool("r2", "mcp__tester__report_final", { status: "PARTIAL", evidence: ["saw b"], handoff_notes: "hn" });
const feedLines = (...lines: string[]): StreamSpawner => (_c, _a, h) => { for (const l of lines) h.onLine(l); h.onClose(0, null); return { kill() {} }; };

describe("runScenario — tool reports", () => {
  it("report_final wins: verdict and steps come from the tools, actions filled from the scenario", async () => {
    const emptyResult = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "" });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, finalReport, emptyResult), logLine: () => {} });
    expect(r.status).toBe("PARTIAL");
    expect(r.reported_via).toBe("tool");
    expect(r.evidence).toEqual(["saw b"]);
    expect(r.handoff_notes).toBe("hn");
    expect(r.steps).toEqual([
      { index: 1, action: "navigate", status: "PASS" },
      { index: 2, action: "click", status: "SKIPPED", note: "absent" },
      { index: 4, action: "?", status: "PASS" },           // out-of-range index is kept, not dropped
    ]);
  });
  it("a killed executor keeps the steps it reported and explains the kill", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(stepsReport); h.onClose(null, "SIGTERM"); return { kill() {} }; };
    const r = await runScenario(three, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.steps.map((s) => s.index)).toEqual([1, 2, 4]);
    expect(r.reported_via).toBe("tool");
    expect(r.not_tested_reason).toMatch(/never emitted/);
  });
  it("an error-type result with no text names the subtype and errors", async () => {
    const budget = JSON.stringify({ type: "result", subtype: "error_max_budget_usd", is_error: true, errors: ["Reached maximum budget ($5)"] });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, budget), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/error_max_budget_usd: Reached maximum budget/);
    expect(r.steps).toHaveLength(3);
  });
  it("a normal exit with empty text and no report_final is NOT_TESTED with a clear reason", async () => {
    const emptyResult = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "" });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, emptyResult), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/ended without report_final/);
    expect(r.steps).toHaveLength(3);
  });
  it("text fallback: no tools → parsed text, reported_via text", async () => {
    const r = await runScenario(scenario, { ...base, spawner: feedLines(tool, okResult), logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.reported_via).toBe("text");
  });
  it("text fallback prefers tool-reported steps over the text's steps", async () => {
    const textWithSteps = JSON.stringify({ type: "result", result: '{"status":"PASS","steps":[{"index":9,"action":"x","status":"PASS"}]}' });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, textWithSteps), logLine: () => {} });
    expect(r.steps.map((s) => s.index)).toEqual([1, 2, 4]);
  });
  it("permission_denied reason replaces the generic haiku text", async () => {
    const denied = JSON.stringify({ type: "system", subtype: "permission_denied", tool_name: "mcp__claude-in-chrome__tabs_create_mcp", decision_reason_type: "asyncAgent", decision_reason: "requires approval, and this session has no approval surface" });
    const resultDenied = JSON.stringify({ type: "result", result: "prose", permission_denials: [{ tool_name: "mcp__claude-in-chrome__tabs_create_mcp", tool_input: {} }] });
    const r = await runScenario(three, { ...base, spawner: feedLines(denied, resultDenied), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/tabs_create_mcp/);
    expect(r.not_tested_reason).toMatch(/no approval surface/);
    expect(r.not_tested_reason).not.toMatch(/2026-08-05/);
  });
  it("records claude_code_version, browser_pin and warnings from the stream", async () => {
    const init = JSON.stringify({ type: "system", subtype: "init", claude_code_version: "2.1.284", tools: ["ToolSearch", "BrandNewTool"], mcp_servers: [{ name: "tester", status: "connected" }] });
    const pin = useTool("p", "mcp__claude-in-chrome__select_browser", { deviceId: "d79" });
    const pinErr = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "p", is_error: true, content: "no such device" }] } });
    const click = (id: string) => useTool(id, "mcp__claude-in-chrome__computer", { action: "left_click", coordinate: [1, 1] });
    const r = await runScenario(three, { ...base, targets: { frontend: "http://x", browserDeviceId: "d79" }, previousClaudeCodeVersion: "2.1.283",
      spawner: feedLines(init, pin, pinErr, click("c1"), click("c2"), finalReport), logLine: () => {} });
    expect(r.claude_code_version).toBe("2.1.284");
    expect(r.browser_pin).toEqual({ requested: "d79", ok: false, error: "no such device" });
    expect(r.warnings?.join("\n")).toMatch(/BrandNewTool/);
    expect(r.warnings?.join("\n")).toMatch(/2\.1\.283 → 2\.1\.284/);
    expect(r.warnings?.join("\n")).toMatch(/browser pin failed/);
    expect(r.warnings?.join("\n")).toMatch(/clicked the same target again/);
  });
});

describe("runScenario — SKIPPED guard", () => {
  const withOptional: Scenario = { id: "s4", title: "t", locale: "ru", steps: [
    { action: "navigate", url: "/" },
    { action: "wait_for", target: { css: "#h" }, optional: true },
    { action: "click", target: { css: "#save" } },
  ] };
  it("keeps PASS when only optional steps are SKIPPED", async () => {
    const steps = useTool("r1", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "SKIPPED" }, { index: 3, status: "PASS" }] });
    const final = useTool("r2", "mcp__tester__report_final", { status: "PASS", evidence: ["ok"] });
    const r = await runScenario(withOptional, { ...base, spawner: feedLines(steps, final), logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.warnings).toBeUndefined();
  });
  it("downgrades PASS to PARTIAL and warns when a non-optional step is SKIPPED", async () => {
    const steps = useTool("r1", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "SKIPPED" }, { index: 3, status: "SKIPPED" }] });
    const final = useTool("r2", "mcp__tester__report_final", { status: "PASS", evidence: ["ok"] });
    const r = await runScenario(withOptional, { ...base, spawner: feedLines(steps, final), logLine: () => {} });
    expect(r.status).toBe("PARTIAL");
    expect(r.warnings?.join("\n")).toMatch(/non-optional step\(s\) as SKIPPED: 3/);
    expect(r.warnings?.join("\n")).not.toMatch(/SKIPPED: 2/);
  });
  it("leaves FAIL and NOT_TESTED verdicts alone but still warns", async () => {
    const steps = useTool("r1", "mcp__tester__report_steps", { steps: [{ index: 3, status: "SKIPPED" }] });
    const final = useTool("r2", "mcp__tester__report_final", { status: "FAIL", evidence: ["x"] });
    const r = await runScenario(withOptional, { ...base, spawner: feedLines(steps, final), logLine: () => {} });
    expect(r.status).toBe("FAIL");
    expect(r.warnings?.join("\n")).toMatch(/SKIPPED: 3/);
  });
});

describe("runScenario — review fixes", () => {
  it("a prose-only last message without report_final names the missing report, not JSON parsing", async () => {
    const prose = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "모든 화면을 확인했습니다." });
    const r = await runScenario(three, { ...base, spawner: feedLines(stepsReport, prose), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/ended without report_final/);
    expect(r.not_tested_reason).not.toMatch(/could not parse JSON/);
    expect(r.steps).toHaveLength(3);
    expect(r.raw_executor_text).toContain("모든 화면");
  });
  it("a killed run still names the chrome denial seen in the stream", async () => {
    const denied = JSON.stringify({ type: "system", subtype: "permission_denied", tool_name: "mcp__claude-in-chrome__navigate", decision_reason_type: "other", decision_reason: "tab URL unresolved" });
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(denied); h.onLine(tool); h.onClose(null, "SIGKILL"); return { kill() {} }; };
    const r = await runScenario(three, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/navigate/);
    expect(r.not_tested_reason).toMatch(/tab URL unresolved/);
  });
  it("does not warn about Read being offered to an upload scenario", async () => {
    const upload: Scenario = { id: "u", title: "t", locale: "ru", steps: [{ action: "upload", target: { css: "#f" }, file: "C:/x.txt" }] };
    const init = JSON.stringify({ type: "system", subtype: "init", claude_code_version: "2.1.283", tools: ["Read", "ToolSearch"], mcp_servers: [{ name: "tester", status: "connected" }] });
    const final = useTool("r2", "mcp__tester__report_final", { status: "PASS", evidence: ["ok"] });
    const r = await runScenario(upload, { ...base, spawner: feedLines(init, final), logLine: () => {} });
    expect(r.warnings).toBeUndefined();
  });
});

describe("runScenario — denial text does not override the executor's own reason", () => {
  it("keeps the executor's not_tested_reason from report_final and appends the denial", async () => {
    const final = useTool("r2", "mcp__tester__report_final", { status: "NOT_TESTED", evidence: [], not_tested_reason: "tab and tab group disappeared after step 19" });
    const resultDenied = JSON.stringify({ type: "result", result: "", permission_denials: [{ tool_name: "mcp__claude-in-chrome__computer", tool_input: {} }] });
    const r = await runScenario(three, { ...base, model: "sonnet", spawner: feedLines(final, resultDenied), logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/^tab and tab group disappeared after step 19/);
    expect(r.not_tested_reason).toMatch(/denied the executor \(computer\)/);
  });
  it("does not blame haiku for a denial when the executor model is not haiku", async () => {
    const resultDenied = JSON.stringify({ type: "result", result: "prose", permission_denials: [{ tool_name: "mcp__claude-in-chrome__computer", tool_input: {} }] });
    const r = await runScenario(three, { ...base, model: "sonnet", spawner: feedLines(resultDenied), logLine: () => {} });
    expect(r.not_tested_reason).toMatch(/denied the executor \(computer\)/);
    expect(r.not_tested_reason).not.toMatch(/haiku/);
    expect(r.not_tested_reason).toMatch(/extension/);
  });
});
