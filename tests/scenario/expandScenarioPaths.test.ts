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
  it("디렉토리 → 정렬된 .yaml/.yml만", () => {
    const out = expandScenarioPaths([dir]);
    expect(out.map((p) => p.replace(/.*[\\/]/, ""))).toEqual(["a.yml", "b.yaml"]);
  });
  it("개별 파일은 그대로", () => {
    const f = join(dir, "b.yaml");
    expect(expandScenarioPaths([f])).toEqual([f]);
  });
  it("중복 제거", () => {
    const f = join(dir, "b.yaml");
    expect(expandScenarioPaths([f, f])).toEqual([f]);
  });
  it("없는 경로면 에러", () => {
    expect(() => expandScenarioPaths([join(dir, "nope.yaml")])).toThrow(/없음/);
  });
  it("시나리오 없는 디렉토리면 에러", () => {
    expect(() => expandScenarioPaths([join(dir, "empty")])).toThrow(/없음/);
  });
});
