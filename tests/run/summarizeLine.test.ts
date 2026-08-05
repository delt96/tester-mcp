import { describe, it, expect } from "vitest";
import { summarizeLine } from "../../src/run/summarizeLine.js";

describe("summarizeLine", () => {
  it("renders tool_use as arrow + name, prefix stripped", () => {
    const l = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__claude-in-chrome__navigate" }] } });
    expect(summarizeLine(l)).toBe("→ navigate");
  });
  it("tool_result → ok / error", () => {
    expect(summarizeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: false }] } }))).toBe("← ok");
    expect(summarizeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: true }] } }))).toBe("✗ error");
  });
  it("renders a result event as ■ RESULT", () => {
    expect(summarizeLine(JSON.stringify({ type: "result", result: "x" }))).toBe("■ RESULT");
  });
  it("returns undefined for narration-only text, system events, broken lines and blank lines", () => {
    expect(summarizeLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "thinking" }] } }))).toBeUndefined();
    expect(summarizeLine(JSON.stringify({ type: "system", subtype: "init" }))).toBeUndefined();
    expect(summarizeLine("not json")).toBeUndefined();
    expect(summarizeLine("")).toBeUndefined();
  });
});
