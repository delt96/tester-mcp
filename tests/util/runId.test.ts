import { describe, it, expect } from "vitest";
import { makeRunId } from "../../src/util/runId.js";

describe("makeRunId", () => {
  it("filesystem-safe timestamp", () => {
    expect(makeRunId(new Date("2026-05-26T10:23:15.000Z"))).toBe("2026-05-26T10-23-15");
  });
  it("formats the current time when called with no argument", () => {
    expect(makeRunId()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});
