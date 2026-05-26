import { describe, it, expect } from "vitest";
import { buildExecutorArgs } from "../../src/run/buildExecutorArgs.js";

describe("buildExecutorArgs", () => {
  it("claude -p 인자 합성", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    expect(a.slice(0, 2)).toEqual(["-p", "P"]);
    for (const f of ["--chrome", "--model", "haiku", "--output-format", "json", "--append-system-prompt", "--bare", "--no-session-persistence"])
      expect(a).toContain(f);
    expect(a).not.toContain("--json-schema");   // [확장4] 이 슬라이스 제외
  });
});
