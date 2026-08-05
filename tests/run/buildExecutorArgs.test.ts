import { describe, it, expect } from "vitest";
import { buildExecutorArgs } from "../../src/run/buildExecutorArgs.js";

describe("buildExecutorArgs", () => {
  it("assembles the claude -p arguments", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    expect(a.slice(0, 2)).toEqual(["-p", "P"]);
    for (const f of ["--chrome", "--model", "haiku", "--output-format", "stream-json", "--verbose", "--append-system-prompt", "--dangerously-skip-permissions", "--no-session-persistence"])
      expect(a).toContain(f);
    expect(a).not.toContain("--json-schema");   // [ext4] out of scope for this slice
    expect(a).not.toContain("--bare");           // measured: --bare breaks auth ("Not logged in")
  });

  it("loads minimal context: drops unused MCP servers, keeps cache-friendly flags", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    // --strict-mcp-config + empty --mcp-config: chrome still arrives via --chrome,
    // while user MCP servers (obsidian/alarm/...) are dropped (measured: chrome tools still work).
    expect(a).toContain("--strict-mcp-config");
    const mi = a.indexOf("--mcp-config");
    expect(mi).toBeGreaterThan(-1);
    expect(JSON.parse(a[mi + 1])).toEqual({ mcpServers: {} });
    // move per-machine sections into the first user message -> better cross-process prompt-cache reuse
    expect(a).toContain("--exclude-dynamic-system-prompt-sections");
  });

  it("passes --effort when set, omits it otherwise", () => {
    const withEffort = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "sonnet", effort: "low" });
    const ei = withEffort.indexOf("--effort");
    expect(ei).toBeGreaterThan(-1);
    expect(withEffort[ei + 1]).toBe("low");
    expect(buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "sonnet" })).not.toContain("--effort");
  });

  it("isolation: blocks host CLAUDE.md / hooks / skills hijacking (flags verified live)", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    // skills off (no Skill invocation)
    expect(a).toContain("--disable-slash-commands");
    // project/local settings not loaded
    const si = a.indexOf("--setting-sources");
    expect(si).toBeGreaterThan(-1);
    expect(a[si + 1]).toBe("user");
    // hooks off (blocks the SessionStart superpowers hook)
    const sj = a.indexOf("--settings");
    expect(sj).toBeGreaterThan(-1);
    expect(JSON.parse(a[sj + 1])).toEqual({ disableAllHooks: true });
    // hard-deny the wandering tools (Task/Bash/Write/Edit/Read etc.)
    const di = a.indexOf("--disallowedTools");
    expect(di).toBeGreaterThan(-1);
    for (const t of ["Skill", "Task", "Bash", "Write", "Edit", "Read"])
      expect(a[di + 1]).toContain(t);
  });
});
