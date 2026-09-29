import { describe, it, expect } from "vitest";
import { readPreviousClaudeCodeVersion } from "../../src/result/previousRun.js";

const fs = (dirs: string[], summaries: Record<string, string | undefined>) => ({
  listDirs: () => dirs,
  readSummary: (p: string) => summaries[p.replace(/\\/g, "/")],
});

describe("readPreviousClaudeCodeVersion", () => {
  it("reads the newest run that is not the current one", () => {
    const f = fs(["2026-09-28T07-58-05", "2026-09-28T08-03-48", "2026-09-28T08-10-00"], {
      "runs/2026-09-28T08-03-48/summary.json": JSON.stringify({ claude_code_version: "2.1.283" }),
    });
    expect(readPreviousClaudeCodeVersion("runs", "2026-09-28T08-10-00", f)).toBe("2.1.283");
  });
  it("skips runs without a version and tolerates unreadable or invalid summaries", () => {
    const f = fs(["a", "b", "c"], { "runs/c/summary.json": "{not json", "runs/b/summary.json": JSON.stringify({}), "runs/a/summary.json": JSON.stringify({ claude_code_version: "2.1.280" }) });
    expect(readPreviousClaudeCodeVersion("runs", "zzz", f)).toBe("2.1.280");
  });
  it("returns undefined when the output dir is missing or empty", () => {
    expect(readPreviousClaudeCodeVersion("runs", "x", { listDirs: () => { throw new Error("ENOENT"); }, readSummary: () => undefined })).toBeUndefined();
    expect(readPreviousClaudeCodeVersion("runs", "x", fs([], {}))).toBeUndefined();
  });
});
