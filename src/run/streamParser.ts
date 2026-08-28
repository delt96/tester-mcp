import type { Envelope } from "./spawnExecutor.js";

export interface TrailItem { t_ms: number; phase: "use" | "result"; tool?: string; is_error?: boolean; }
export interface StreamState {
  envelope?: Envelope;
  trail: TrailItem[];
  lastTool?: string;
  toolCount: number;
  consecutiveTool: number;   // run-length of the same tool_use back-to-back (groping signal)
  deniedTools: string[];     // tool names from the result event's permission_denials
  inputBeforeScreenshot: boolean;  // clicked/typed before the tab's first screenshot → input was silently dropped
}

const COMPUTER_TOOL_RE = /(^|__)computer$/;
// Anything that drives the page. 'wait'/'cursor_position' are harmless and deliberately absent.
const INPUT_ACTIONS = new Set([
  "left_click", "right_click", "middle_click", "double_click", "triple_click",
  "left_click_drag", "mouse_move", "type", "key", "hold_key", "scroll",
]);

// Parses stream-json lines into a diagnostic snapshot. Stores ONLY event
// types / tool names / timing — never tool inputs or assistant text (which
// may contain secrets). The single exception is the computer tool's `action`,
// a fixed enum (never user data), needed to spot the dropped-input failure below.
// `now` is injected for deterministic timing in tests.
export function makeStreamAccumulator(now: () => number = () => Date.now()) {
  const t0 = now();
  const state: StreamState = { trail: [], toolCount: 0, consecutiveTool: 0, deniedTools: [], inputBeforeScreenshot: false };
  let screenshotSeen = false;

  function handleContent(content: unknown) {
    if (!Array.isArray(content)) return;
    for (const c of content as Array<Record<string, unknown>>) {
      if (c?.type === "tool_use") {
        const tool = typeof c.name === "string" ? c.name : undefined;
        state.trail.push({ t_ms: now() - t0, phase: "use", tool });
        state.consecutiveTool = tool && tool === state.lastTool ? state.consecutiveTool + 1 : 1;
        state.lastTool = tool;
        state.toolCount++;
        if (tool && COMPUTER_TOOL_RE.test(tool)) {
          const action = (c.input as Record<string, unknown> | undefined)?.action;
          if (action === "screenshot") screenshotSeen = true;
          else if (typeof action === "string" && INPUT_ACTIONS.has(action) && !screenshotSeen)
            state.inputBeforeScreenshot = true;
        }
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
      // Names only — a denial carries the rejected tool_input, which can hold fill values (secrets).
      if (Array.isArray(ev.permission_denials)) {
        for (const d of ev.permission_denials as Array<Record<string, unknown>>) {
          if (typeof d?.tool_name === "string") state.deniedTools.push(d.tool_name);
        }
      }
    }
  }

  function snapshot(): StreamState {
    return { envelope: state.envelope, trail: [...state.trail], lastTool: state.lastTool, toolCount: state.toolCount, consecutiveTool: state.consecutiveTool, deniedTools: [...state.deniedTools], inputBeforeScreenshot: state.inputBeforeScreenshot };
  }

  return { push, snapshot };
}
