import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expandScenarioPaths } from "../../src/scenario/expandScenarioPaths.js";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "scn-"));
  writeFileSync(join(dir, "b.yaml"), "id: b");
  writeFileSync(join(dir, "a.yml"), "id: a");
  writeFileSync(join(dir, "note.txt"), "ignore me");
  mkdirSync(join(dir, "empty"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("expandScenarioPaths", () => {
  it("expands a directory to sorted .yaml/.yml files only", () => {
    const out = expandScenarioPaths([dir]);
    expect(out.map((p) => p.replace(/.*[\\/]/, ""))).toEqual(["a.yml", "b.yaml"]);
  });
  it("passes individual files through unchanged", () => {
    const f = join(dir, "b.yaml");
    expect(expandScenarioPaths([f])).toEqual([f]);
  });
  it("removes duplicates", () => {
    const f = join(dir, "b.yaml");
    expect(expandScenarioPaths([f, f])).toEqual([f]);
  });
  it("throws on a missing path", () => {
    expect(() => expandScenarioPaths([join(dir, "nope.yaml")])).toThrow(/scenario path not found/);
  });
  it("throws on a directory with no scenarios", () => {
    expect(() => expandScenarioPaths([join(dir, "empty")])).toThrow(/no scenarios/);
  });
});

describe("recursive collection", () => {
  it("collects *.yaml from nested subdirectories, sorted depth-first by name", () => {
    const root = mkdtempSync(join(tmpdir(), "esp-"));
    mkdirSync(join(root, "b"));
    mkdirSync(join(root, "a", "deep"), { recursive: true });
    writeFileSync(join(root, "b", "2.yaml"), "x");
    writeFileSync(join(root, "a", "deep", "1.yaml"), "x");
    expect(expandScenarioPaths([root])).toEqual([
      join(root, "a", "deep", "1.yaml"),
      join(root, "b", "2.yaml"),
    ]);
  });
  it("skips underscore-prefixed files and directories", () => {
    const root = mkdtempSync(join(tmpdir(), "esp-"));
    mkdirSync(join(root, "_fragments"));
    writeFileSync(join(root, "_fragments", "login.yaml"), "x");
    writeFileSync(join(root, "_selectors.yaml"), "x");
    writeFileSync(join(root, "ok.yaml"), "x");
    expect(expandScenarioPaths([root])).toEqual([join(root, "ok.yaml")]);
  });
  it("errors when a directory yields only underscore assets", () => {
    const root = mkdtempSync(join(tmpdir(), "esp-"));
    writeFileSync(join(root, "_selectors.yaml"), "x");
    expect(() => expandScenarioPaths([root])).toThrow(/no scenarios/);
  });
});
