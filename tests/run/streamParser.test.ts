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
