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
  it("envelope를 result 이벤트에서 회수", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    const s = acc.snapshot();
    expect(s.envelope?.result).toContain('"status":"PASS"');
    expect(s.envelope?.session_id).toBe("S1");
    expect(s.envelope?.total_cost_usd).toBe(0.01);
  });
  it("trail·lastTool·toolCount 추출", () => {
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
  it("비밀 페이로드 미보존 (input/text 안 들어감)", () => {
    const acc = makeStreamAccumulator(() => 0);
    for (const l of lines) acc.push(l);
    const json = JSON.stringify(acc.snapshot());
    expect(json).not.toContain("best1234");
    expect(json).not.toContain("thinking about");
  });
  it("깨진 줄은 skip, 빈 줄 무시", () => {
    const acc = makeStreamAccumulator(() => 0);
    acc.push("not json");
    acc.push("");
    acc.push(lines[4]);
    expect(acc.snapshot().envelope?.result).toContain("PASS");
  });
});
