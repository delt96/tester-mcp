import { describe, it, expect } from "vitest";
import { resolveSecrets } from "../../src/secrets/resolveSecrets.js";

describe("resolveSecrets", () => {
  const env = { SECRET_TESTER_USERNAME: "u1", SECRET_TESTER_PASSWORD: "p1" };
  it("substitutes ${secrets.a.b} from env SECRET_A_B", () => {
    expect(resolveSecrets("${secrets.tester.username}", { env })).toBe("u1");
  });
  it("leaves a non-secret string untouched", () => {
    expect(resolveSecrets("plain", { env })).toBe("plain");
  });
  it("throws when missing, naming the path and the env key", () => {
    expect(() => resolveSecrets("${secrets.tester.token}", { env })).toThrow(
      /SECRET_TESTER_TOKEN/
    );
  });
  it("prefers the file value over env", () => {
    const secrets = { tester: { username: "from-file" } };
    expect(resolveSecrets("${secrets.tester.username}", { secrets, env })).toBe("from-file");
  });
  it("falls back to env SECRET_* when the file lacks the key", () => {
    const secrets = { tester: { password: "only-pw" } };
    expect(resolveSecrets("${secrets.tester.username}", { secrets, env })).toBe("u1");
  });
});
