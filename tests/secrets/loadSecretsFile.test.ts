import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSecretsFile } from "../../src/secrets/loadSecretsFile.js";

describe("loadSecretsFile", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const d of created) rmSync(d, { recursive: true, force: true });
    created.length = 0;
  });

  it("parses an existing file into an object", () => {
    const dir = mkdtempSync(join(tmpdir(), "tmsec-"));
    created.push(dir);
    const file = join(dir, "tester-mcp.secrets.yaml");
    writeFileSync(file, "tester:\n  username: u1\n  password: p1\n", "utf8");
    expect(loadSecretsFile(file)).toEqual({ tester: { username: "u1", password: "p1" } });
  });

  it("returns an empty object when the file is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "tmsec-"));
    created.push(dir);
    expect(loadSecretsFile(join(dir, "nope.yaml"))).toEqual({});
  });
});
