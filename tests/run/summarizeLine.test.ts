import { describe, it, expect } from "vitest";
import { summarizeLine } from "../../src/run/summarizeLine.js";

describe("summarizeLine", () => {
  it("tool_use → 화살표+이름(접두사 제거)", () => {
    const l = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__claude-in-chrome__navigate" }] } });
    expect(summarizeLine(l)).toBe("→ navigate");
  });
  it("tool_result → ok / error", () => {
    expect(summarizeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: false }] } }))).toBe("← ok");
    expect(summarizeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: true }] } }))).toBe("✗ error");
  });
  it("result 이벤트 → ■ RESULT", () => {
    expect(summarizeLine(JSON.stringify({ type: "result", result: "x" }))).toBe("■ RESULT");
  });
  it("narration(text만)·system·깨진 줄·빈 줄 → undefined", () => {
    expect(summarizeLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "생각중" }] } }))).toBeUndefined();
    expect(summarizeLine(JSON.stringify({ type: "system", subtype: "init" }))).toBeUndefined();
    expect(summarizeLine("not json")).toBeUndefined();
    expect(summarizeLine("")).toBeUndefined();
  });
});
