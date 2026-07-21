import { describe, it, expect } from "vitest";
import { parseTagFilter, matchesTagFilter } from "../../src/scenario/tags.js";

describe("tag filter", () => {
  it("parses csv, trimming and dropping empties", () => {
    expect(parseTagFilter(" smoke, letter ,")).toEqual(["smoke", "letter"]);
    expect(parseTagFilter(undefined)).toEqual([]);
  });
  it("empty filter matches everything; otherwise OR over scenario tags", () => {
    expect(matchesTagFilter(undefined, [])).toBe(true);
    expect(matchesTagFilter(["a"], ["a", "b"])).toBe(true);
    expect(matchesTagFilter(["c"], ["a", "b"])).toBe(false);
    expect(matchesTagFilter(undefined, ["a"])).toBe(false);
  });
});
