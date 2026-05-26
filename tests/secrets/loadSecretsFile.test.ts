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

  it("존재하는 파일을 파싱해 객체로 반환한다", () => {
    const dir = mkdtempSync(join(tmpdir(), "tmsec-"));
    created.push(dir);
    const file = join(dir, "tester-mcp.secrets.yaml");
    writeFileSync(file, "tester:\n  username: u1\n  password: p1\n", "utf8");
    expect(loadSecretsFile(file)).toEqual({ tester: { username: "u1", password: "p1" } });
  });

  it("파일이 없으면 빈 객체를 반환한다", () => {
    const dir = mkdtempSync(join(tmpdir(), "tmsec-"));
    created.push(dir);
    expect(loadSecretsFile(join(dir, "nope.yaml"))).toEqual({});
  });
});
