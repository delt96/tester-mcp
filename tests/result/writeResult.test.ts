import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeScenarioResult, writeSummary } from "../../src/result/writeResult.js";
import type { ScenarioResult } from "../../src/result/types.js";

let dir = "";
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const result: ScenarioResult = {
  run_id: "RID", scenario_id: "login-success", status: "PASS",
  started_at: "2026-05-26T00:00:00Z", duration_ms: 1234, steps: [],
  environment: { node_version: "v20", os: "win32" },
};

describe("writeResult", () => {
  it("runs/<runId>/<scenario>.json 작성", () => {
    dir = mkdtempSync(join(tmpdir(), "be2e-"));
    const p = writeScenarioResult(dir, result);
    expect(JSON.parse(readFileSync(p, "utf8")).status).toBe("PASS");
  });
  it("summary.json 집계", () => {
    dir = mkdtempSync(join(tmpdir(), "be2e-"));
    const s = JSON.parse(readFileSync(writeSummary(dir, "RID", "2026-05-26T00:00:00Z", [result]), "utf8"));
    expect(s.total).toBe(1); expect(s.by_status.PASS).toBe(1);
  });
});
