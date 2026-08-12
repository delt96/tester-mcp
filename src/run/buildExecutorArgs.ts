export interface ExecutorArgsOptions {
  prompt: string; systemPrompt: string; model: string; effort?: string;
  allowRead?: boolean;
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
  // --effort trades reasoning depth for tokens. Omitted → the CLI's own default (high) applies;
  // 'low' is the lever that offsets the cost of running a bigger model than haiku.
  const effort = o.effort ? ["--effort", o.effort] : [];
  // Read is denied by default (it is one of the tools that make a loose executor wander).
  // But claude-in-chrome's file_upload gates on it: with Read denied it refuses every path with
  // "only files this session is allowed to read can be uploaded", even one inside the repo — so
  // upload scenarios must allow it. Measured 2026-08-12: allowing Read was the ONLY change needed
  // (--add-dir made no difference, since --dangerously-skip-permissions already covers paths
  // outside cwd), and the executor called Read 0 times across the passing runs.
  const denied = ["Skill", "Task", "Agent", "Bash", "Write", "Edit", "NotebookEdit", "Glob", "Grep", "WebFetch", "WebSearch"];
  if (!o.allowRead) denied.push("Read");
  return [
    "-p", o.prompt,
    "--chrome",
    "--model", o.model,
    ...effort,
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
    denied.join(","),
  ];
}
