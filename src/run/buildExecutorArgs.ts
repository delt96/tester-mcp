export interface ExecutorArgsOptions {
  prompt: string; systemPrompt: string; model: string;
}
export function buildExecutorArgs(o: ExecutorArgsOptions): string[] {
  // Flag set verified by live smoke tests against claude -p --chrome:
  // - --dangerously-skip-permissions: required so chrome tools (navigate/click) auto-run.
  //   (--permission-mode dontAsk BLOCKS them → executor stalls on a permission prompt.)
  // - NO --bare: --bare skips auth context too → executor fails with "Not logged in".
  //   (--bare would only work with ANTHROPIC_API_KEY env; OAuth/keychain are never read.)
  // - --strict-mcp-config + empty --mcp-config: load NO ambient MCP servers
  //   (obsidian/alarm/gmail/...). chrome tools still come from --chrome (verified: a
  //   smoke run reported chrome_tools_available=yes and read example.com under this combo),
  //   so this trims unused MCP tool schemas + instructions from the executor's context.
  // - --exclude-dynamic-system-prompt-sections: move per-machine bits (cwd/env/git) out of
  //   the system prompt → better cross-process prompt-cache reuse across parallel/repeat runs.
  return [
    "-p", o.prompt,
    "--chrome",
    "--model", o.model,
    "--append-system-prompt", o.systemPrompt,
    "--output-format", "stream-json",
    "--verbose",                 // stream-json requires --verbose; emits per-event JSON lines
    "--dangerously-skip-permissions",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config", JSON.stringify({ mcpServers: {} }),
    "--exclude-dynamic-system-prompt-sections",
    // ── Isolation (verified live 2026-05-26) ──
    // Without these the executor inherits the HOST environment — project/global
    // CLAUDE.md, the SessionStart "superpowers" hook, and all skills — and gets
    // hijacked into the doc/skill workflow: it calls Skill, spawns subagents (Task),
    // and runs Bash/Write/Edit/Read, never touching the browser, until the timeout.
    // (Live diagnostic: WITHOUT these → zero chrome tool calls; WITH these → immediate
    // mcp__claude-in-chrome__* calls.) --bare would also strip all this but breaks
    // OAuth/keychain auth ("Not logged in"), so we strip piecemeal instead.
    "--disable-slash-commands",                                 // no Skill invocation
    "--setting-sources", "user",                                // skip project/local settings (hooks/config)
    "--settings", JSON.stringify({ disableAllHooks: true }),    // no hooks (SessionStart)
    "--disallowedTools",                                        // hard-deny the wandering tools
    "Skill,Task,Agent,Bash,Write,Edit,Read,NotebookEdit,Glob,Grep,WebFetch,WebSearch",
  ];
}
