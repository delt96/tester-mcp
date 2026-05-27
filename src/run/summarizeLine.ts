// Condense one stream-json line into a terse console summary for --verbose.
// Returns undefined for non-tool events (narration/system) so the console
// shows only tool activity. Never includes inputs/text (secret-safe).
export function summarizeLine(line: string): string | undefined {
  const s = line.trim();
  if (!s) return undefined;
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(s); } catch { return undefined; }
  if (ev.type === "result") return "■ RESULT";
  if (ev.type === "assistant" || ev.type === "user") {
    const content = (ev.message as Record<string, unknown> | undefined)?.content;
    if (!Array.isArray(content)) return undefined;
    for (const c of content as Array<Record<string, unknown>>) {
      if (c?.type === "tool_use") return `→ ${String(c.name ?? "").replace("mcp__claude-in-chrome__", "")}`;
      if (c?.type === "tool_result") return c.is_error ? "✗ error" : "← ok";
    }
  }
  return undefined;
}
