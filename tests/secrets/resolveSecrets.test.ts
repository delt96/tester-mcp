import { describe, it, expect } from "vitest";
import { resolveSecrets } from "../../src/secrets/resolveSecrets.js";

describe("resolveSecrets", () => {
  const env = { BESTIAN_SECRET_TESTER_USERNAME: "u1", BESTIAN_SECRET_TESTER_PASSWORD: "p1" };
  it("${secrets.a.b}를 env로 치환한다", () => {
    expect(resolveSecrets("${secrets.tester.username}", env)).toBe("u1");
  });
  it("시크릿이 아닌 문자열은 그대로", () => {
    expect(resolveSecrets("plain", env)).toBe("plain");
  });
  it("누락 시 에러(어느 키인지 명시)", () => {
    expect(() => resolveSecrets("${secrets.tester.token}", env)).toThrow(/BESTIAN_SECRET_TESTER_TOKEN/);
  });
});
