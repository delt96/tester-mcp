import { describe, it, expect } from "vitest";
import { collectSecretValues, redactSecrets, redactString } from "../../src/secrets/redactSecrets.js";

describe("collectSecretValues", () => {
  it("collects only SECRET_* env values of length >= 4", () => {
    const vals = collectSecretValues({
      env: {
        SECRET_TESTER_PASSWORD: "best1234",
        SECRET_TESTER_USERNAME: "admin",
        SECRET_SHORT: "x", // length 1 — excluded to avoid over-masking
        OTHER: "nope",
      },
    });
    expect(vals.sort()).toEqual(["admin", "best1234"]);
  });
  it("recursively collects string leaves from the secrets object", () => {
    const vals = collectSecretValues({
      secrets: { tester: { username: "admin", password: "best1234" }, nested: { deep: { k: "abcd" } } },
    });
    expect(vals.sort()).toEqual(["abcd", "admin", "best1234"]);
  });
  it("merges file and env values, dropping duplicates", () => {
    const vals = collectSecretValues({
      secrets: { tester: { password: "best1234" } },
      env: { SECRET_TESTER_PASSWORD: "best1234", SECRET_TESTER_USERNAME: "admin" },
    });
    expect(vals.sort()).toEqual(["admin", "best1234"]);
  });
});

describe("redactString", () => {
  it("replaces every secret value with ***", () => {
    expect(redactString("login best1234 ok best1234", ["best1234"])).toBe("login *** ok ***");
    expect(redactString("plain", [])).toBe("plain");
    expect(redactString("a", ["", "a"])).toBe("***"); // empty strings are ignored
  });
});

describe("redactSecrets", () => {
  it("replaces secret values inside a result object", () => {
    const result = {
      status: "PASS",
      evidence: ["password: best1234 entered", "ID: admin"],
      raw_executor_text: "logged in as admin / best1234",
    };
    const red = redactSecrets(result, ["best1234", "admin"]);
    expect(red.evidence).toEqual(["password: *** entered", "ID: ***"]);
    expect(red.raw_executor_text).toBe("logged in as *** / ***");
    expect(red.status).toBe("PASS");
  });
  it("returns the original when there are no secrets", () => {
    const r = { a: 1 };
    expect(redactSecrets(r, [])).toEqual(r);
  });
});
