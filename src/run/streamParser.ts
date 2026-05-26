import type { Envelope } from "./spawnExecutor.js";

export interface TrailItem { t_ms: number; phase: "use" | "result"; tool?: string; is_error?: boolean; }
export interface StreamState {
  envelope?: Envelope;
  trail: TrailItem[];
  lastTool?: string;
  toolCount: number;
}

// Parses stream-json lines into a diagnostic snapshot. Stores ONLY event
// types / tool names / timing — never tool inputs or assistant text (which
// may contain secrets). `now` is injected for deterministic timing in tests.
export function makeStreamAccumulator(now: () => number = () => Date.now()) {
  const t0 = now();
  const state: StreamState = { trail: [], toolCount: 0 };

  function handleContent(content: unknown) {
    if (!Array.isArray(content)) return;
    for (const c of content as Array<Record<string, unknown>>) {
      if (c?.type === "tool_use") {
        const tool = typeof c.name === "string" ? c.name : undefined;
        state.trail.push({ t_ms: now() - t0, phase: "use", tool });
        state.lastTool = tool;
        state.toolCount++;
      } else if (c?.type === "tool_result") {
        state.trail.push({ t_ms: now() - t0, phase: "result", is_error: !!c.is_error });
      }
      // text / input deltas are intentionally ignored (secret-safe).
    }
  }

  function push(line: string): void {
    const s = line.trim();
    if (!s) return;
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(s); } catch { return; }
    const t = ev.type;
    if (t === "assistant" || t === "user") {
      handleContent((ev.message as Record<string, unknown> | undefined)?.content);
    } else if (t === "result") {
      // NOTE: result is the model's final text, stored RAW. It can contain secrets; redaction is the downstream layer's job (see redactSecrets). The trail/lastTool above never store raw text/inputs — only result does.
      state.envelope = {
        result: typeof ev.result === "string" ? ev.result : "",
        session_id: typeof ev.session_id === "string" ? ev.session_id : undefined,
        total_cost_usd: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined,
      };
    }
  }

  function snapshot(): StreamState {
    return { envelope: state.envelope, trail: [...state.trail], lastTool: state.lastTool, toolCount: state.toolCount };
  }

  return { push, snapshot };
}
