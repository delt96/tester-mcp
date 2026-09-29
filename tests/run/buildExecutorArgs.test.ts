import { describe, it, expect } from "vitest";
import { buildExecutorArgs } from "../../src/run/buildExecutorArgs.js";
import { APPROVER_TOOL } from "../../src/run/executorTools.js";

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
    // --strict-mcp-config + --mcp-config holding only the tester server: chrome still arrives via --chrome,
    // while user MCP servers (obsidian/alarm/...) are dropped (measured: chrome tools still work).
    expect(a).toContain("--strict-mcp-config");
    const mi = a.indexOf("--mcp-config");
    expect(mi).toBeGreaterThan(-1);
    expect(Object.keys(JSON.parse(a[mi + 1]).mcpServers)).toEqual(["tester"]);
    // move per-machine sections into the first user message -> better cross-process prompt-cache reuse
    expect(a).toContain("--exclude-dynamic-system-prompt-sections");
  });

  it("attaches the bundled approver as the permission-prompt handler (Claude in Chrome approval gate)", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "haiku" });
    expect(a[a.indexOf("--permission-prompts") + 1]).toBe("host");
    expect(a[a.indexOf("--permission-prompt-tool") + 1]).toBe(APPROVER_TOOL);
    const mcp = JSON.parse(a[a.indexOf("--mcp-config") + 1]);
    // spawned with the running node binary and an absolute, forward-slash path (a Git Bash
    // /c/... path does not start the server on Windows)
    expect(mcp.mcpServers.tester.command).not.toContain("\\");
    expect(mcp.mcpServers.tester.args).toHaveLength(1);
    expect(mcp.mcpServers.tester.args[0]).toMatch(/^([A-Za-z]:)?\//);
    expect(mcp.mcpServers.tester.args[0]).toMatch(/bin\/executor-tools\.cjs$/);
    // the model must not call the handler itself; the CLI still uses it (measured 2026-09-28)
    expect(a[a.indexOf("--disallowedTools") + 1].split(",")).toContain(APPROVER_TOOL);
    // the report tools stay callable — the model must use them
    for (const t of ["mcp__tester__report_steps", "mcp__tester__report_final"])
      expect(a[a.indexOf("--disallowedTools") + 1].split(",")).not.toContain(t);
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

  it("denies Read by default but opens it for upload scenarios (file_upload gates on it)", () => {
    const denied = (o: Parameters<typeof buildExecutorArgs>[0]) => {
      const a = buildExecutorArgs(o);
      return a[a.indexOf("--disallowedTools") + 1].split(",");
    };
    const base = { prompt: "P", systemPrompt: "S", model: "sonnet" };
    expect(denied(base)).toContain("Read");
    expect(denied({ ...base, allowRead: true })).not.toContain("Read");
    // every other wandering tool stays denied either way
    for (const t of ["Skill", "Task", "Bash", "Write", "Edit"])
      expect(denied({ ...base, allowRead: true })).toContain(t);
  });
});

describe("buildExecutorArgs — built-in tools measured leaking on 2.1.283", () => {
  it("denies the interactive and task-list tools that the -p executor is still offered", () => {
    const a = buildExecutorArgs({ prompt: "P", systemPrompt: "S", model: "sonnet" });
    const denied = a[a.indexOf("--disallowedTools") + 1].split(",");
    for (const t of ["AskUserQuestion", "EnterPlanMode", "ExitPlanMode", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"])
      expect(denied).toContain(t);
  });
});
