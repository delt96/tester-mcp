import { describe, it, expect } from "vitest";
import { KNOWN_BUILTIN_TOOLS, initWarnings, pinWarnings, repeatedClickWarning } from "../../src/run/assembleWarnings.js";

describe("initWarnings", () => {
  const init = { claudeCodeVersion: "2.1.284", builtinTools: ["ToolSearch", "BrandNewTool"], mcpServers: [{ name: "tester", status: "connected" }, { name: "claude-in-chrome", status: "connected" }] };
  it("names built-in tools outside the known set", () => {
    const w = initWarnings(init, "2.1.284");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/BrandNewTool/);
    expect(w[0]).not.toMatch(/ToolSearch/);
  });
  it("warns when the tester server is missing or not connected", () => {
    expect(initWarnings({ ...init, builtinTools: [], mcpServers: [] }, "2.1.284")[0]).toMatch(/tester tool server not connected/);
    expect(initWarnings({ ...init, builtinTools: [], mcpServers: [{ name: "tester", status: "failed" }] }, "2.1.284")[0]).toMatch(/not connected/);
  });
  it("warns when Claude Code's version differs from the previous run", () => {
    const w = initWarnings({ ...init, builtinTools: [] }, "2.1.283");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/2\.1\.283 → 2\.1\.284/);
  });
  it("is silent without an init event or without a previous version", () => {
    expect(initWarnings(undefined, "2.1.283")).toEqual([]);
    expect(initWarnings({ ...init, builtinTools: [] }, undefined)).toEqual([]);
  });
  it("the known set holds the 2.1.283 leak list and StructuredOutput", () => {
    for (const t of ["ReportFindings", "ScheduleWakeup", "ToolSearch", "Workflow", "StructuredOutput"]) expect(KNOWN_BUILTIN_TOOLS).toContain(t);
  });
});

describe("pinWarnings", () => {
  it("is silent when no pin is configured, or the pin succeeded", () => {
    expect(pinWarnings(undefined, true, undefined)).toEqual([]);
    expect(pinWarnings({ requested: "d79", ok: true }, false, "d79")).toEqual([]);
  });
  it("reports a failed pin with the tool's error", () => {
    expect(pinWarnings({ requested: "d79", ok: false, error: "no such device" }, false, "d79")[0]).toMatch(/browser pin failed: no such device/);
  });
  it("reports tabs touched before pinning, and a pin to a different device than configured", () => {
    expect(pinWarnings(undefined, true, "d79")[0]).toMatch(/did not pin the browser/);
    expect(pinWarnings({ requested: "other", ok: true }, false, "d79")[0]).toMatch(/pinned "other" but the config says "d79"/);
  });
});

describe("repeatedClickWarning", () => {
  it("is undefined without repeats and names the calls otherwise", () => {
    expect(repeatedClickWarning([])).toBeUndefined();
    const w = repeatedClickWarning([{ call: 3, key: "computer:left_click:[10,10]" }, { call: 9, key: "js:abcd1234" }]);
    expect(w).toMatch(/2 time\(s\)/);
    expect(w).toMatch(/#3, #9/);
    expect(w).toMatch(/duplicated a record/);
  });
});
