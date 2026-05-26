import { describe, it, expect } from "vitest";
import { buildExecutorArgs } from "../../src/run/buildExecutorArgs.js";

describe("buildExecutorArgs", () => {
  it("claude -p 인자 합성", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    expect(a.slice(0, 2)).toEqual(["-p", "P"]);
    for (const f of ["--chrome", "--model", "haiku", "--output-format", "json", "--append-system-prompt", "--dangerously-skip-permissions", "--no-session-persistence"])
      expect(a).toContain(f);
    expect(a).not.toContain("--json-schema");   // [확장4] 이 슬라이스 제외
    expect(a).not.toContain("--bare");           // 실측: --bare는 auth 끊김("Not logged in")
  });

  it("최소 컨텍스트 로드: 비사용 MCP 제거 + 캐시 친화 플래그", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    // --strict-mcp-config + 빈 --mcp-config: chrome은 --chrome이 제공하므로 살아있고,
    // obsidian/alarm 등 사용자 MCP 서버는 제거됨 (실측: chrome 툴 정상 동작 확인).
    expect(a).toContain("--strict-mcp-config");
    const mi = a.indexOf("--mcp-config");
    expect(mi).toBeGreaterThan(-1);
    expect(JSON.parse(a[mi + 1])).toEqual({ mcpServers: {} });
    // 머신별 섹션을 첫 user 메시지로 이동 → 프로세스 간 프롬프트 캐시 재사용↑
    expect(a).toContain("--exclude-dynamic-system-prompt-sections");
  });
});
