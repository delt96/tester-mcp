import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseFragment, parseSelectors, discoverReuseAssets } from "../../src/scenario/reuseAssets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "..", "fixtures", "reuse");

describe("parseFragment", () => {
  it("parses id, params (string default / null = required), steps", () => {
    const f = parseFragment(`id: a\nparams: { x: "1", y: }\nsteps:\n  - { action: navigate, url: "/" }`, "a.yaml");
    expect(f.params).toEqual({ x: "1", y: null });
    expect(f.steps).toHaveLength(1);
  });
  it("rejects nested use (no fragment nesting)", () => {
    expect(() => parseFragment(`id: a\nsteps:\n  - use: other`, "a.yaml"))
      .toThrow(/cannot nest/);
  });
  it("rejects missing/invalid id and empty steps", () => {
    expect(() => parseFragment(`steps: [{ action: navigate, url: "/" }]`, "a.yaml")).toThrow(/id/);
    expect(() => parseFragment(`id: a\nsteps: []`, "a.yaml")).toThrow(/steps/);
  });
});

describe("parseSelectors", () => {
  it("parses name → target map", () => {
    const s = parseSelectors(`ok:\n  css: ".x"\n  description: d`, "s.yaml");
    expect(s.ok).toEqual({ css: ".x", description: "d" });
  });
  it("rejects unknown target fields and non-object values", () => {
    expect(() => parseSelectors(`bad:\n  href: "/x"`, "s.yaml")).toThrow(/unknown target field/);
    expect(() => parseSelectors(`bad: ".css-string"`, "s.yaml")).toThrow(/target object/);
  });
});

describe("discoverReuseAssets", () => {
  it("picks the nearest _selectors.yaml and keeps walking up for fragments", () => {
    const assets = discoverReuseAssets(join(FIX, "area", "deep", "dummy.yaml"));
    expect(assets.selectors.toast_success).toEqual({ css: ".area-toast", description: "area override" });
    expect(assets.fragments.get("login")?.params).toEqual({ account: "tester" });
  });
  it("returns empty assets when nothing is found", () => {
    const dir = mkdtempSync(join(tmpdir(), "reuse-assets-empty-"));
    try {
      const assets = discoverReuseAssets(join(dir, "no-assets-here.yaml"));
      expect(assets.fragments.size).toBe(0);
      expect(Object.keys(assets.selectors)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
