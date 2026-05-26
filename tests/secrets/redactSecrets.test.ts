import { describe, it, expect } from "vitest";
import { collectSecretValues, redactSecrets } from "../../src/secrets/redactSecrets.js";

describe("collectSecretValues", () => {
  it("BESTIAN_SECRET_* 값만, 길이>=4만 수집", () => {
    const vals = collectSecretValues({
      BESTIAN_SECRET_TESTER_PASSWORD: "best1234",
      BESTIAN_SECRET_TESTER_USERNAME: "admin",
      BESTIAN_SECRET_SHORT: "x",        // 길이 1 → 과잉마스킹 방지로 제외
      OTHER: "nope",
    });
    expect(vals.sort()).toEqual(["admin", "best1234"]);
  });
});

describe("redactSecrets", () => {
  it("결과 객체에서 시크릿 값을 ***로 치환한다", () => {
    const result = {
      status: "PASS",
      evidence: ["비밀번호: best1234 입력", "ID: admin"],
      raw_executor_text: "logged in as admin / best1234",
    };
    const red = redactSecrets(result, ["best1234", "admin"]);
    expect(red.evidence).toEqual(["비밀번호: *** 입력", "ID: ***"]);
    expect(red.raw_executor_text).toBe("logged in as *** / ***");
    expect(red.status).toBe("PASS");
  });
  it("시크릿 없으면 원본 그대로", () => {
    const r = { a: 1 };
    expect(redactSecrets(r, [])).toEqual(r);
  });
});
