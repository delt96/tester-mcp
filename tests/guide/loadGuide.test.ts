import { describe, it, expect } from "vitest";
import { findGuidePath, loadGuide } from "../../src/guide/loadGuide.js";

const REL = ["skills", "tester-mcp", "document-guide.md"].join("/");

describe("findGuidePath", () => {
  it("finds the guide at the start directory", () => {
    const exists = (p: string) => p.replace(/\\/g, "/").endsWith("/start/" + REL);
    expect(findGuidePath("/start", exists)?.replace(/\\/g, "/")).toBe("/start/" + REL);
  });
  it("walks up to a parent directory", () => {
    const exists = (p: string) => p.replace(/\\/g, "/").endsWith("/root/" + REL);
    expect(findGuidePath("/root/dist/sub", exists)?.replace(/\\/g, "/")).toBe("/root/" + REL);
  });
  it("returns undefined when never found", () => {
    expect(findGuidePath("/nowhere", () => false)).toBeUndefined();
  });
});

describe("loadGuide", () => {
  it("reads the guide via injected fs", () => {
    const fs = { exists: () => true, read: () => "GUIDE BODY" };
    expect(loadGuide("/start", fs)).toBe("GUIDE BODY");
  });
  it("throws a clear error when the guide is missing", () => {
    const fs = { exists: () => false, read: () => "" };
    expect(() => loadGuide("/start", fs)).toThrow(/document-guide\.md/);
  });
});
