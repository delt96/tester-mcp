import { describe, it, expect } from "vitest";
import { makeRunId } from "../../src/util/runId.js";

describe("makeRunId", () => {
  it("파일시스템 안전 타임스탬프", () => {
    expect(makeRunId(new Date("2026-05-26T10:23:15.000Z"))).toBe("2026-05-26T10-23-15");
  });
  it("인자 없으면 현재시각 형식", () => {
    expect(makeRunId()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});
