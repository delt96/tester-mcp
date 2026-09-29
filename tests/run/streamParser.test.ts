import { describe, it, expect } from "vitest";
import { makeStreamAccumulator } from "../../src/run/streamParser.js";

const lines = [
  JSON.stringify({ type: "system", subtype: "init", session_id: "S1" }),
  JSON.stringify({ type: "assistant", message: { content: [
    { type: "text", text: "thinking about secret password best1234" },
    { type: "tool_use", name: "mcp__claude-in-chrome__navigate", input: { url: "/", secret: "best1234" } },
  ] } }),
  JSON.stringify({ type: "user", message: { content: [
    { type: "tool_result", tool_use_id: "t1", is_error: false, content: "ok" },
  ] } }),
  JSON.stringify({ type: "assistant", message: { content: [
    { type: "tool_use", name: "mcp__claude-in-chrome__find", input: { q: "x" } },
  ] } }),
  JSON.stringify({ type: "result", subtype: "success", is_error: false,
    result: "```json\n{\"status\":\"PASS\"}\n```", session_id: "S1", total_cost_usd: 0.01, duration_ms: 1234 }),
];

describe("makeStreamAccumulator", () => {
  it("recovers the envelope from the result event", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    const s = acc.snapshot();
    expect(s.envelope?.result).toContain('"status":"PASS"');
    expect(s.envelope?.session_id).toBe("S1");
    expect(s.envelope?.total_cost_usd).toBe(0.01);
  });
  it("extracts trail, lastTool and toolCount", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    const s = acc.snapshot();
    expect(s.toolCount).toBe(2);
    expect(s.lastTool).toBe("mcp__claude-in-chrome__find");
    expect(s.trail.map((t) => t.tool)).toEqual([
      "mcp__claude-in-chrome__navigate", undefined, "mcp__claude-in-chrome__find",
    ]);
    expect(s.trail.map((t) => t.phase)).toEqual(["use", "result", "use"]);
  });
  it("counts back-to-back calls of the same tool in consecutiveTool (groping signal)", () => {
    const acc = makeStreamAccumulator(() => 0);
    const use = (name: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name }] } });
    const res = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: false }] } });
    acc.push(use("find")); acc.push(res);
    acc.push(use("find")); acc.push(res);
    acc.push(use("find"));
    expect(acc.snapshot().consecutiveTool).toBe(3);   // a tool_result in between does not break the run
    acc.push(use("click"));                            // a different tool resets it
    expect(acc.snapshot().consecutiveTool).toBe(1);
  });
  it("never stores secret payloads (no input/text kept)", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    const json = JSON.stringify(acc.snapshot());
    expect(json).not.toContain("best1234");
    expect(json).not.toContain("thinking about");
  });
  it("skips broken lines and ignores blank ones", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push("not json");
    acc.push("");
    acc.push(lines[4]);
    expect(acc.snapshot().envelope?.result).toContain("PASS");
  });
  it("collects permission_denials as tool names only", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push(JSON.stringify({ type: "result", result: "denied", permission_denials: [
      { tool_name: "mcp__claude-in-chrome__tabs_context_mcp", tool_use_id: "t1", tool_input: { pw: "best1234" } },
      { tool_name: "mcp__claude-in-chrome__tabs_create_mcp", tool_use_id: "t2", tool_input: {} },
    ] }));
    const s = acc.snapshot();
    expect(s.deniedTools).toEqual([
      "mcp__claude-in-chrome__tabs_context_mcp", "mcp__claude-in-chrome__tabs_create_mcp",
    ]);
    expect(JSON.stringify(s.deniedTools)).not.toContain("best1234");   // tool_input never stored
  });
  it("no permission_denials → empty deniedTools", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    expect(acc.snapshot().deniedTools).toEqual([]);
  });
  it("keeps the trail clean even when result holds a secret (the leak surface is envelope.result only)", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "fill" }] } }));
    acc.push(JSON.stringify({ type: "result", result: "password was best1234" }));
    const s = acc.snapshot();
    expect(JSON.stringify(s.trail)).not.toContain("best1234");   // the trail holds tool names only
    expect(s.envelope?.result).toContain("best1234");            // raw lives only on the envelope (redacted downstream)
  });
});

const computerUse = (action: string) => JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: "mcp__claude-in-chrome__computer", input: { action, text: "best1234" } }] },
});

describe("warm-up detection (input before the first screenshot)", () => {
  it("flags a click that happens before any screenshot", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push(computerUse("left_click"));
    expect(acc.snapshot().inputBeforeScreenshot).toBe(true);
  });
  it("does not flag input taken after a screenshot", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push(computerUse("screenshot"));
    acc.push(computerUse("left_click"));
    acc.push(computerUse("type"));
    expect(acc.snapshot().inputBeforeScreenshot).toBe(false);
  });
  it("ignores non-computer tools", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    expect(acc.snapshot().inputBeforeScreenshot).toBe(false);
  });
  it("stores the action name only — never the rest of the input", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push(computerUse("type"));
    expect(JSON.stringify(acc.snapshot())).not.toContain("best1234");
  });
});

const ev = (o: unknown) => JSON.stringify(o);
const use = (id: string, name: string, input: Record<string, unknown>) =>
  ev({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const res = (id: string, is_error: boolean, content: unknown) =>
  ev({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error, content }] } });
const feed = (ls: string[]) => { const acc = makeStreamAccumulator(() => 0); for (const l of ls) acc.push(l); return acc.snapshot(); };

describe("step reports via the tester tools", () => {
  it("collects report_steps batches; a later report of the same index wins", () => {
    const s = feed([
      use("a", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "FAIL", note: "no header" }] }),
      use("b", "mcp__tester__report_steps", { steps: [{ index: 2, status: "PASS" }] }),
    ]);
    expect(s.reportedSteps).toEqual([{ index: 1, status: "PASS" }, { index: 2, status: "PASS" }]);
  });
  it("drops malformed entries (non-integer index, unknown status) but keeps the good ones", () => {
    const s = feed([use("a", "mcp__tester__report_steps", { steps: [{ index: "3-4", status: "PASS" }, { index: 5, status: "OK" }, { index: 6, status: "SKIPPED" }] })]);
    expect(s.reportedSteps).toEqual([{ index: 6, status: "SKIPPED" }]);
  });
  it("captures report_final (the last one wins) and filters evidence to strings", () => {
    const s = feed([
      use("a", "mcp__tester__report_final", { status: "FAIL", evidence: ["x"] }),
      use("b", "mcp__tester__report_final", { status: "PASS", evidence: ["ok", 7], handoff_notes: "h", screenshots: ["C:/s.png"] }),
    ]);
    expect(s.finalReport).toEqual({ status: "PASS", evidence: ["ok"], handoff_notes: "h", not_tested_reason: undefined, screenshots: ["C:/s.png"] });
  });
  it("ignores a report_final with a status outside the four labels", () => {
    expect(feed([use("a", "mcp__tester__report_final", { status: "DONE", evidence: [] })]).finalReport).toBeUndefined();
  });
  it("still counts report tools as tool calls for the groping signal (unchanged behaviour)", () => {
    const s = feed([use("a", "mcp__tester__report_steps", { steps: [{ index: 1, status: "PASS" }] }), use("b", "mcp__tester__report_steps", { steps: [{ index: 2, status: "PASS" }] })]);
    expect(s.consecutiveTool).toBe(2);
  });
});

describe("permission_denied, result meta and init", () => {
  it("records permission_denied events with their reason", () => {
    const s = feed([ev({ type: "system", subtype: "permission_denied", tool_name: "mcp__claude-in-chrome__tabs_create_mcp", decision_reason_type: "asyncAgent", decision_reason: "requires approval, no approval surface" })]);
    expect(s.permissionDenied).toEqual([{ tool: "mcp__claude-in-chrome__tabs_create_mcp", reasonType: "asyncAgent", reason: "requires approval, no approval surface" }]);
  });
  it("stringifies a non-string decision_reason instead of crashing", () => {
    const s = feed([ev({ type: "system", subtype: "permission_denied", tool_name: "X", decision_reason: { code: 7 } })]);
    expect(s.permissionDenied[0].reason).toBe('{"code":7}');
  });
  it("keeps result meta even when the result event has no result string", () => {
    const s = feed([ev({ type: "result", subtype: "error_max_budget_usd", is_error: true, errors: ["Reached maximum budget ($0.0001)"], terminal_reason: "budget_exhausted" })]);
    expect(s.envelope?.result).toBe("");
    expect(s.resultMeta).toEqual({ subtype: "error_max_budget_usd", isError: true, errors: ["Reached maximum budget ($0.0001)"], terminalReason: "budget_exhausted" });
  });
  it("splits the init tool list into built-in and MCP, and keeps version and servers", () => {
    const s = feed([ev({ type: "system", subtype: "init", claude_code_version: "2.1.283", tools: ["ToolSearch", "mcp__claude-in-chrome__find", "mcp__tester__approve"], mcp_servers: [{ name: "tester", status: "connected" }, { name: "claude-in-chrome", status: "connected" }] })]);
    expect(s.init).toEqual({ claudeCodeVersion: "2.1.283", builtinTools: ["ToolSearch"], mcpServers: [{ name: "tester", status: "connected" }, { name: "claude-in-chrome", status: "connected" }] });
  });
});

describe("browser pin", () => {
  it("records a successful select_browser with the requested deviceId", () => {
    const s = feed([use("p", "mcp__claude-in-chrome__select_browser", { deviceId: "d79" }), res("p", false, [{ type: "text", text: "Selected browser" }])]);
    expect(s.browserPin).toEqual({ requested: "d79", ok: true, error: undefined });
    expect(s.tabsBeforePin).toBe(false);
  });
  it("records a failed select_browser with the first 200 chars of the error", () => {
    const s = feed([use("p", "mcp__claude-in-chrome__select_browser", { deviceId: "d79" }), res("p", true, "No browser with deviceId d79 is connected. " + "x".repeat(300))]);
    expect(s.browserPin?.ok).toBe(false);
    expect(s.browserPin?.error).toHaveLength(200);
  });
  it("flags a tab tool used before any select_browser", () => {
    const s = feed([use("t", "mcp__claude-in-chrome__tabs_context_mcp", { createIfEmpty: true })]);
    expect(s.tabsBeforePin).toBe(true);
    expect(s.browserPin).toBeUndefined();
  });
});

describe("repeated clicks", () => {
  const click = (id: string, x: number, y: number) => use(id, "mcp__claude-in-chrome__computer", { action: "left_click", coordinate: [x, y] });
  it("flags the same coordinate clicked again within the last 8 calls", () => {
    const s = feed([click("1", 10, 10), use("2", "mcp__claude-in-chrome__find", { q: "x" }), click("3", 10, 10)]);
    expect(s.repeatedClicks).toEqual([{ call: 3, key: "computer:left_click:[10,10]" }]);
  });
  it("does not flag a click more than 8 calls later", () => {
    const filler = Array.from({ length: 8 }, (_, i) => use(`f${i}`, "mcp__claude-in-chrome__find", { q: String(i) }));
    expect(feed([click("1", 10, 10), ...filler, click("9", 10, 10)]).repeatedClicks).toEqual([]);
  });
  it("keys javascript clicks by a hash of the script and never stores the script", () => {
    const js = "document.querySelector('#save').click()";
    const s = feed([use("1", "mcp__claude-in-chrome__javascript_tool", { text: js }), use("2", "mcp__claude-in-chrome__javascript_tool", { text: js })]);
    expect(s.repeatedClicks).toHaveLength(1);
    expect(s.repeatedClicks[0].key).toMatch(/^js:[0-9a-f]{8}$/);
    expect(JSON.stringify(s)).not.toContain("#save");
  });
  it("sees clicks inside browser_batch as separate calls", () => {
    const s = feed([click("1", 5, 5), use("2", "mcp__claude-in-chrome__browser_batch", { actions: [{ name: "computer", input: { action: "left_click", coordinate: [5, 5] } }] })]);
    expect(s.repeatedClicks).toHaveLength(1);
  });
  it("ignores non-click computer actions and non-click scripts", () => {
    const s = feed([use("1", "mcp__claude-in-chrome__computer", { action: "screenshot" }), use("2", "mcp__claude-in-chrome__computer", { action: "screenshot" }), use("3", "mcp__claude-in-chrome__javascript_tool", { text: "document.title" }), use("4", "mcp__claude-in-chrome__javascript_tool", { text: "document.title" })]);
    expect(s.repeatedClicks).toEqual([]);
  });
});
