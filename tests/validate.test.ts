import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { validateScenarioFiles } from "../src/validate.js";

describe("validateScenarioFiles", () => {
  it("reports ok with step count for a valid scenario", () => {
    const dir = mkdtempSync(join(tmpdir(), "val-"));
    const p = join(dir, "ok.yaml");
    writeFileSync(p, `id: ok\ntitle: t\nsteps:\n  - { action: navigate, url: "/" }`);
    const [r] = validateScenarioFiles([p], {});
    expect(r).toMatchObject({ file: p, ok: true, steps: 1 });
  });
  it("reports the expansion error message for a broken scenario", () => {
    const dir = mkdtempSync(join(tmpdir(), "val-"));
    const p = join(dir, "bad.yaml");
    writeFileSync(p, `id: bad\ntitle: t\nsteps:\n  - use: nope`);
    const [r] = validateScenarioFiles([p], {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/fragment 'nope' not found/);
  });
});
