import { describe, it, expect } from "vitest";
import { collectScreenshots, type ScreenshotFs } from "../../src/result/collectScreenshots.js";

function fakeFs(failOn?: string) {
  const copied: Array<[string, string]> = [];
  const made: string[] = [];
  const fs: ScreenshotFs = {
    mkdir: (d) => { made.push(d); },
    copy: (s, d) => { if (s === failOn) throw new Error("EPERM"); copied.push([s, d]); },
  };
  return { fs, copied, made };
}

describe("collectScreenshots", () => {
  it("copies each screenshot into the run directory and returns the new paths", () => {
    const { fs, copied, made } = fakeFs();
    const out = collectScreenshots(["/tmp/a.png", "/tmp/b.png"], "runs/RID/s1", fs);
    expect(made).toEqual(["runs/RID/s1"]);
    expect(copied).toHaveLength(2);
    expect(out[0]).toMatch(/a\.png$/);
    expect(out[0]).not.toBe("/tmp/a.png");
  });

  // Losing the evidence entirely is worse than pointing at a path that may expire.
  it("keeps the original path when one copy fails, and still copies the rest", () => {
    const { fs } = fakeFs("/tmp/a.png");
    const out = collectScreenshots(["/tmp/a.png", "/tmp/b.png"], "runs/RID/s1", fs);
    expect(out[0]).toBe("/tmp/a.png");
    expect(out[1]).toMatch(/b\.png$/);
  });

  it("falls back to the original paths when the directory cannot be created", () => {
    const fs: ScreenshotFs = { mkdir: () => { throw new Error("EACCES"); }, copy: () => {} };
    expect(collectScreenshots(["/tmp/a.png"], "runs/RID/s1", fs)).toEqual(["/tmp/a.png"]);
  });

  it("does nothing and creates no directory for an empty list", () => {
    const { fs, made } = fakeFs();
    expect(collectScreenshots([], "runs/RID/s1", fs)).toEqual([]);
    expect(made).toEqual([]);
  });
});
