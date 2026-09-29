import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { EXECUTOR_TOOLS_PATH } from "../../src/run/executorTools.js";

const require = createRequire(import.meta.url);
const server = require(EXECUTOR_TOOLS_PATH) as {
  callTool(name: string, args: Record<string, unknown>): { isError?: boolean; content: { type: string; text: string }[] };
  TOOLS: { name: string }[];
};

describe("executor-tools server (unit)", () => {
  it("exposes approve, report_steps and report_final", () => {
    expect(server.TOOLS.map((t) => t.name)).toEqual(["approve", "report_steps", "report_final"]);
  });
  it("approve allows every request and echoes the input", () => {
    const r = server.callTool("approve", { tool_name: "x", input: { a: 1 } });
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0].text)).toEqual({ behavior: "allow", updatedInput: { a: 1 } });
  });
  it("report_steps accepts a batch and says how many it recorded", () => {
    const r = server.callTool("report_steps", { steps: [{ index: 1, status: "PASS" }, { index: 2, status: "SKIPPED", note: "no header" }] });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toBe("recorded 2 step(s)");
  });
  it("report_steps rejects a non-integer index and names the entry", () => {
    const r = server.callTool("report_steps", { steps: [{ index: "35-36", status: "PASS" }] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/steps\[0\]\.index/);
    expect(r.content[0].text).toMatch(/35-36/);
  });
  it("report_steps rejects an unknown status and an empty array", () => {
    expect(server.callTool("report_steps", { steps: [{ index: 1, status: "OK" }] }).isError).toBe(true);
    expect(server.callTool("report_steps", { steps: [] }).isError).toBe(true);
  });
  it("report_final accepts the four labels and rejects others", () => {
    expect(server.callTool("report_final", { status: "PASS", evidence: ["e"] }).content[0].text).toBe("recorded final: PASS");
    expect(server.callTool("report_final", { status: "DONE", evidence: [] }).isError).toBe(true);
    expect(server.callTool("report_final", { status: "PASS" }).isError).toBe(true);
  });
  it("unknown tool is an error", () => {
    expect(server.callTool("nope", {}).isError).toBe(true);
  });
});

describe("executor-tools server (stdio)", () => {
  it("answers initialize, tools/list and tools/call over stdin/stdout", () => {
    const input = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "report_steps", arguments: { steps: [{ index: 1, status: "PASS" }] } } },
    ].map((m) => JSON.stringify(m)).join("\n") + "\n";
    const out = spawnSync(process.execPath, [EXECUTOR_TOOLS_PATH], { input, encoding: "utf8", timeout: 10_000 });
    const lines = out.stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "tester" } } });
    expect(lines[1].result.tools.map((t: { name: string }) => t.name)).toEqual(["approve", "report_steps", "report_final"]);
    expect(lines[2]).toMatchObject({ id: 3, result: { content: [{ type: "text", text: "recorded 1 step(s)" }] } });
  });
});
