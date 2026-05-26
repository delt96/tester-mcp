import { describe, it, expect } from "vitest";
import { resolveSecrets } from "../../src/secrets/resolveSecrets.js";

describe("resolveSecrets", () => {
  const env = { SECRET_TESTER_USERNAME: "u1", SECRET_TESTER_PASSWORD: "p1" };
  it("${secrets.a.b}를 env(SECRET_A_B)로 치환한다", () => {
    expect(resolveSecrets("${secrets.tester.username}", { env })).toBe("u1");
  });
  it("시크릿이 아닌 문자열은 그대로", () => {
    expect(resolveSecrets("plain", { env })).toBe("plain");
  });
  it("누락 시 에러(경로와 env 키 명시)", () => {
    expect(() => resolveSecrets("${secrets.tester.token}", { env })).toThrow(
      /SECRET_TESTER_TOKEN/
    );
  });
  it("파일 값이 env보다 우선한다", () => {
    const secrets = { tester: { username: "from-file" } };
    expect(resolveSecrets("${secrets.tester.username}", { secrets, env })).toBe("from-file");
  });
  it("파일에 키가 없으면 env(SECRET_*)로 폴백한다", () => {
    const secrets = { tester: { password: "only-pw" } };
    expect(resolveSecrets("${secrets.tester.username}", { secrets, env })).toBe("u1");
  });
});
