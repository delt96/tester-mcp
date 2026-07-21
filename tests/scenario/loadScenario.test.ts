import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadScenario } from "../../src/scenario/loadScenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "..", "fixtures", "reuse");

describe("loadScenario", () => {
  it("loads, discovers assets upward, expands, and validates", () => {
    // Add a login_as scenario to the fixture tree.
    mkdirSync(join(FIX, "area", "deep"), { recursive: true });
    const p = join(FIX, "area", "deep", "with-login.yaml");
    writeFileSync(p, [
      "id: with-login",
      "title: fixture",
      "login_as: gduser",
      "tags: [smoke]",
      "steps:",
      '  - { action: navigate, url: "/x" }',
    ].join("\n"));
    const sc = loadScenario(p);
    expect(sc.steps).toHaveLength(3);            // login fragment 2 + own 1
    expect((sc.steps[1] as any).value).toBe("${secrets.gduser.username}");
    expect(sc.tags).toEqual(["smoke"]);
  });
});
