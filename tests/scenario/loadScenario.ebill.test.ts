// tests/scenario/loadScenario.ebill.test.ts — guards the migrated ebill assets
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadScenario } from "../../src/scenario/loadScenario.js";
import { expandScenarioPaths } from "../../src/scenario/expandScenarioPaths.js";

const EBILL = join(__dirname, "..", "..", "scenarios", "ebill");

describe("ebill migrated scenarios", () => {
  it("all scenarios expand without errors (vars-free files)", () => {
    const vars = {
      billmng_cmt_doc_a: "/stub-a",
      billmng_cmt_doc_b: "/stub-b",
      legalact_doc_url: "/stub-c",
    };
    const files = expandScenarioPaths([EBILL]);
    // Floor = scenario count at migration time; new scenarios are expected to grow this.
    expect(files.length).toBeGreaterThanOrEqual(27);
    for (const f of files) expect(() => loadScenario(f, vars)).not.toThrow();
  });
  it("login fragment expands at the head of a login_as scenario", () => {
    const sc = loadScenario(join(EBILL, "letter", "inbox-hide-toggle.yaml"));
    expect(sc.steps[0]).toEqual({ action: "navigate", url: "/" });
    expect((sc.steps[1] as any).value).toBe("${secrets.tester.username}");
    expect((sc.steps[3] as any).target.css).toBe(".btn_login");
    const used = JSON.stringify(sc.steps);
    expect(used).not.toContain("{{");
    expect(used).not.toContain('"ref"');
  });
});
