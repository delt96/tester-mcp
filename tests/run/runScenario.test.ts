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
