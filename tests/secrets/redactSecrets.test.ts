import { describe, it, expect } from "vitest";
import { collectSecretValues, redactSecrets, redactString } from "../../src/secrets/redactSecrets.js";

describe("collectSecretValues", () => {
  it("SECRET_* env 값만, 길이>=4만 수집", () => {
    const vals = collectSecretValues({
      env: {
        SECRET_TESTER_PASSWORD: "best1234",
        SECRET_TESTER_USERNAME: "admin",
        SECRET_SHORT: "x", // 길이 1 → 과잉마스킹 방지로 제외
        OTHER: "nope",
      },
    });
    expect(vals.sort()).toEqual(["admin", "best1234"]);
  });
  it("secrets 객체의 문자열 leaf 값을 재귀 수집한다", () => {
    const vals = collectSecretValues({
      secrets: { tester: { username: "admin", password: "best1234" }, nested: { deep: { k: "abcd" } } },
    });
    expect(vals.sort()).toEqual(["abcd", "admin", "best1234"]);
  });
  it("파일과 env를 합치고 중복은 제거한다", () => {
    const vals = collectSecretValues({
      secrets: { tester: { password: "best1234" } },
      env: { SECRET_TESTER_PASSWORD: "best1234", SECRET_TESTER_USERNAME: "admin" },
    });
    expect(vals.sort()).toEqual(["admin", "best1234"]);
  });
});

describe("redactString", () => {
  it("모든 비밀값을 ***로 치환", () => {
    expect(redactString("login best1234 ok best1234", ["best1234"])).toBe("login *** ok ***");
    expect(redactString("plain", [])).toBe("plain");
    expect(redactString("a", ["", "a"])).toBe("***"); // 빈 문자열은 무시
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
