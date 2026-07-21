import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario } from "../../src/scenario/loadScenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "..", "fixtures", "reuse");

describe("loadScenario", () => {
  it("loads, discovers assets upward, expands, and validates", () => {
    // with-login.yaml is a committed fixture (login_as scenario in the fixture tree).
    const p = join(FIX, "area", "deep", "with-login.yaml");
    const sc = loadScenario(p);
    expect(sc.steps).toHaveLength(3);            // login fragment 2 + own 1
    expect((sc.steps[1] as any).value).toBe("${secrets.gduser.username}");
    expect(sc.tags).toEqual(["smoke"]);
  });
});
