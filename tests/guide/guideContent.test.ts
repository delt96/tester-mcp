import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const guide = readFileSync(new URL("../../skills/tester-mcp/document-guide.md", import.meta.url), "utf8");

describe("document-guide content", () => {
  it("documents the browser pin config and its warning", () => {
    expect(guide).toContain("runner.browser_device_id");
    expect(guide).toMatch(/did not pin the browser/);
    expect(guide).not.toMatch(/select_browser[^\n]*(denied|refused) inside/i);
  });
  it("documents step-level optional, SKIPPED and reported_via", () => {
    expect(guide).toContain("optional: true");
    expect(guide).toContain("SKIPPED");
    expect(guide).toContain("reported_via");
  });
});
