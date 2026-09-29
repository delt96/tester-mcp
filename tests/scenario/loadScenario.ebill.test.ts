// tests/scenario/loadScenario.ebill.test.ts — guards the migrated ebill assets
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadScenario } from "../../src/scenario/loadScenario.js";
import { expandScenarioPaths } from "../../src/scenario/expandScenarioPaths.js";
import { builtinVars } from "../../src/scenario/vars.js";

const EBILL = join(__dirname, "..", "..", "scenarios", "ebill");

describe("ebill migrated scenarios", () => {
  it("all scenarios expand without errors (vars-free files)", () => {
    const vars = {
      ...builtinVars(),
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
    const steps = sc.steps as any[];
    expect(steps[0]).toEqual({ action: "navigate", url: "/" });
    // Assert by meaning, not by index — the fragment gains defensive steps over time
    // (warm-up screenshot, per-field assert_value) and index-pinned expectations rot silently.
    const idOf = (css: string, action: string) =>
      steps.findIndex((s) => s.action === action && s.target?.css === css);
    expect(steps[idOf("#userId", "fill")]?.value).toBe("${secrets.tester.username}");
    expect(steps[idOf("#pswd", "fill")]?.value).toBe("${secrets.tester.password}");
    // The submit click must come after both fields are filled.
    expect(idOf(".btn_login", "click")).toBeGreaterThan(idOf("#pswd", "fill"));
    // A screenshot must precede the first click: on a fresh tab the computer tool's
    // click/type are silently dropped until one screenshot has been taken.
    const firstClick = steps.findIndex((s) => s.action === "click");
    const firstShot = steps.findIndex((s) => s.action === "screenshot");
    expect(firstShot).toBeGreaterThanOrEqual(0);
    expect(firstShot).toBeLessThan(firstClick);
    const used = JSON.stringify(sc.steps);
    expect(used).not.toContain("{{");
    expect(used).not.toContain('"ref"');
  });
});
