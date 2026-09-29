import { createHash } from "node:crypto";
import type { Envelope } from "./spawnExecutor.js";
import { REPORT_STEPS_TOOL, REPORT_FINAL_TOOL } from "./executorTools.js";
import { STATUSES, REPORTED_STEP_STATUSES, type Status, type StepStatus } from "../result/types.js";

export interface TrailItem { t_ms: number; phase: "use" | "result"; tool?: string; is_error?: boolean; }
export interface ReportedStep { index: number; status: StepStatus; note?: string; }
export interface FinalReport { status: Status; evidence: string[]; handoff_notes?: string; not_tested_reason?: string; screenshots?: string[]; }
export interface PermissionDenied { tool: string; reasonType?: string; reason?: string; }
export interface ResultMeta { subtype?: string; isError: boolean; errors?: string[]; terminalReason?: string; }
export interface InitInfo { claudeCodeVersion?: string; builtinTools: string[]; mcpServers: { name: string; status: string }[]; }
export interface BrowserPin { requested?: string; ok?: boolean; error?: string; }
export interface RepeatedClick { call: number; key: string; }

export interface StreamState {
  envelope?: Envelope;
  trail: TrailItem[];
  lastTool?: string;
  toolCount: number;
  consecutiveTool: number;   // run-length of the same tool_use back-to-back (groping signal)
  deniedTools: string[];     // tool names from the result event's permission_denials
  inputBeforeScreenshot: boolean;  // clicked/typed before the tab's first screenshot → input was silently dropped
  reportedSteps: ReportedStep[];   // from mcp__tester__report_steps, index-unique, later report wins
  finalReport?: FinalReport;       // from mcp__tester__report_final, last one wins
  permissionDenied: PermissionDenied[];
  resultMeta?: ResultMeta;
  init?: InitInfo;
  browserPin?: BrowserPin;         // first select_browser call and its result
  tabsBeforePin: boolean;          // a tab tool ran while no select_browser had been called
  repeatedClicks: RepeatedClick[]; // same click key seen again within the last CLICK_WINDOW calls
}

const COMPUTER_TOOL_RE = /(^|__)computer$/;
const SELECT_BROWSER_RE = /__select_browser$/;
const TAB_TOOL_RE = /__(tabs_create_mcp|tabs_context_mcp|navigate)$/;
const JS_TOOL_RE = /__javascript_tool$/;
const BATCH_TOOL_RE = /__browser_batch$/;
// Anything that drives the page. 'wait'/'cursor_position' are harmless and deliberately absent.
const INPUT_ACTIONS = new Set([
  "left_click", "right_click", "middle_click", "double_click", "triple_click",
  "left_click_drag", "mouse_move", "type", "key", "hold_key", "scroll",
]);
const CLICK_WINDOW = 8;
const ERROR_TEXT_MAX = 200;
const REASON_TEXT_MAX = 200;
const JS_CLICK_MARKERS = [".click()", "MouseEvent", ".submit()"];

function clickKey(name: string, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  if (COMPUTER_TOOL_RE.test(name)) {
    const action = input.action;
    if (typeof action !== "string" || !/click/.test(action)) return undefined;
    return `computer:${action}:${JSON.stringify(input.coordinate ?? input.ref ?? "")}`;
  }
  if (JS_TOOL_RE.test(name)) {
    const text = String(input.text ?? input.code ?? "");
    // Only the hash is kept: the script can carry form values.
    if (JS_CLICK_MARKERS.some((m) => text.includes(m))) return "js:" + createHash("sha1").update(text).digest("hex").slice(0, 8);
  }
  return undefined;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join(" ");
  return "";
}

// Parses stream-json lines into a diagnostic snapshot. Stores ONLY event types / tool names /
// timing — never tool inputs or assistant text (which may contain secrets). The exceptions are
// listed on the fields above: the tester report tools' arguments (the run result itself, redacted
// downstream), select_browser's deviceId, computer's action/coordinate/ref, and a hash of
// javascript_tool text. `now` is injected for deterministic timing in tests.
export function makeStreamAccumulator(now: () => number = () => Date.now()) {
  const t0 = now();
  const state: StreamState = {
    trail: [], toolCount: 0, consecutiveTool: 0, deniedTools: [], inputBeforeScreenshot: false,
    reportedSteps: [], permissionDenied: [], tabsBeforePin: false, repeatedClicks: [],
  };
  let screenshotSeen = false;
  let pinCalled = false;
  const pending = new Map<string, string>();          // tool_use id → tool name (to pair results)
  const stepsByIndex = new Map<number, ReportedStep>();
  const recentClickKeys: (string | undefined)[] = []; // one slot per tool call, newest last

  function noteClick(key: string | undefined) {
    if (key && recentClickKeys.includes(key)) state.repeatedClicks.push({ call: state.toolCount, key });
    recentClickKeys.push(key);
    if (recentClickKeys.length > CLICK_WINDOW) recentClickKeys.shift();
  }

  function recordSteps(input: Record<string, unknown> | undefined) {
    const steps = input?.steps;
    if (!Array.isArray(steps)) return;
    for (const raw of steps as Array<Record<string, unknown>>) {
      const index = raw?.index, status = raw?.status;
      if (!Number.isInteger(index) || (index as number) < 1 || !REPORTED_STEP_STATUSES.includes(status as StepStatus)) continue;
      const step: ReportedStep = { index: index as number, status: status as StepStatus };
      if (typeof raw.note === "string") step.note = raw.note;
      stepsByIndex.set(step.index, step);
    }
    state.reportedSteps = [...stepsByIndex.values()].sort((a, b) => a.index - b.index);
  }

  function recordFinal(input: Record<string, unknown> | undefined) {
    if (!input || !STATUSES.includes(input.status as Status)) return;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    state.finalReport = {
      status: input.status as Status,
      evidence: strings(input.evidence),
      handoff_notes: typeof input.handoff_notes === "string" ? input.handoff_notes : undefined,
      not_tested_reason: typeof input.not_tested_reason === "string" ? input.not_tested_reason : undefined,
      screenshots: Array.isArray(input.screenshots) ? strings(input.screenshots) : undefined,
    };
  }

  function handleToolUse(c: Record<string, unknown>) {
    const tool = typeof c.name === "string" ? c.name : undefined;
    const input = c.input as Record<string, unknown> | undefined;
    state.trail.push({ t_ms: now() - t0, phase: "use", tool });
    state.consecutiveTool = tool && tool === state.lastTool ? state.consecutiveTool + 1 : 1;
    state.lastTool = tool;
    state.toolCount++;
    if (typeof c.id === "string" && tool) pending.set(c.id, tool);
    if (!tool) { noteClick(undefined); return; }
    if (tool === REPORT_STEPS_TOOL) { recordSteps(input); noteClick(undefined); return; }
    if (tool === REPORT_FINAL_TOOL) { recordFinal(input); noteClick(undefined); return; }
    if (SELECT_BROWSER_RE.test(tool)) {
      pinCalled = true;
      if (!state.browserPin) state.browserPin = { requested: typeof input?.deviceId === "string" ? input.deviceId : undefined };
    } else if (TAB_TOOL_RE.test(tool) && !pinCalled) {
      state.tabsBeforePin = true;
    }
    if (COMPUTER_TOOL_RE.test(tool)) {
      const action = input?.action;
      if (action === "screenshot") screenshotSeen = true;
      else if (typeof action === "string" && INPUT_ACTIONS.has(action) && !screenshotSeen) state.inputBeforeScreenshot = true;
    }
    if (BATCH_TOOL_RE.test(tool)) {
      const actions = Array.isArray(input?.actions) ? (input!.actions as Array<Record<string, unknown>>) : [];
      let any = false;
      for (const a of actions) {
        if (a?.name === "computer") { noteClick(clickKey("computer", a.input as Record<string, unknown>)); any = true; }
      }
      if (!any) noteClick(undefined);
      return;
    }
    noteClick(clickKey(tool, input));
  }

  function handleToolResult(c: Record<string, unknown>) {
    state.trail.push({ t_ms: now() - t0, phase: "result", is_error: !!c.is_error });
    const id = typeof c.tool_use_id === "string" ? c.tool_use_id : undefined;
    const tool = id ? pending.get(id) : undefined;
    if (id) pending.delete(id);
    if (tool && SELECT_BROWSER_RE.test(tool) && state.browserPin && state.browserPin.ok === undefined) {
      state.browserPin.ok = !c.is_error;
      state.browserPin.error = c.is_error ? contentText(c.content).slice(0, ERROR_TEXT_MAX) : undefined;
    }
  }

  function handleContent(content: unknown) {
    if (!Array.isArray(content)) return;
    for (const c of content as Array<Record<string, unknown>>) {
      if (c?.type === "tool_use") handleToolUse(c);
      else if (c?.type === "tool_result") handleToolResult(c);
      // text / input deltas are intentionally ignored (secret-safe).
    }
  }

  function handleSystem(ev: Record<string, unknown>) {
    if (ev.subtype === "init") {
      const tools = Array.isArray(ev.tools) ? (ev.tools as unknown[]).filter((t): t is string => typeof t === "string") : [];
      const servers = Array.isArray(ev.mcp_servers) ? (ev.mcp_servers as Array<Record<string, unknown>>) : [];
      state.init = {
        claudeCodeVersion: typeof ev.claude_code_version === "string" ? ev.claude_code_version : undefined,
        builtinTools: tools.filter((t) => !t.startsWith("mcp__")),
        mcpServers: servers.map((s) => ({ name: String(s?.name ?? ""), status: String(s?.status ?? "") })),
      };
    } else if (ev.subtype === "permission_denied") {
      const reason = ev.decision_reason;
      state.permissionDenied.push({
        tool: typeof ev.tool_name === "string" ? ev.tool_name : "?",
        reasonType: typeof ev.decision_reason_type === "string" ? ev.decision_reason_type : undefined,
        reason: reason === undefined ? undefined : (typeof reason === "string" ? reason : JSON.stringify(reason)).slice(0, REASON_TEXT_MAX),
      });
    }
  }

  function handleResult(ev: Record<string, unknown>) {
    // NOTE: result is the model's final text, stored RAW. It can contain secrets; redaction is the
    // downstream layer's job (see redactSecrets).
    state.envelope = {
      result: typeof ev.result === "string" ? ev.result : "",
      session_id: typeof ev.session_id === "string" ? ev.session_id : undefined,
      total_cost_usd: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined,
    };
    state.resultMeta = {
      subtype: typeof ev.subtype === "string" ? ev.subtype : undefined,
      isError: ev.is_error === true,
      errors: Array.isArray(ev.errors) ? (ev.errors as unknown[]).filter((e): e is string => typeof e === "string") : undefined,
      terminalReason: typeof ev.terminal_reason === "string" ? ev.terminal_reason : undefined,
    };
    // Names only — a denial carries the rejected tool_input, which can hold fill values (secrets).
    if (Array.isArray(ev.permission_denials)) {
      for (const d of ev.permission_denials as Array<Record<string, unknown>>) {
        if (typeof d?.tool_name === "string") state.deniedTools.push(d.tool_name);
      }
    }
  }

  function push(line: string): void {
    const s = line.trim();
    if (!s) return;
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(s); } catch { return; }
    const t = ev.type;
    if (t === "assistant" || t === "user") handleContent((ev.message as Record<string, unknown> | undefined)?.content);
    else if (t === "system") handleSystem(ev);
    else if (t === "result") handleResult(ev);
  }

  function snapshot(): StreamState {
    return {
      ...state,
      trail: [...state.trail], deniedTools: [...state.deniedTools], reportedSteps: [...state.reportedSteps],
      permissionDenied: [...state.permissionDenied], repeatedClicks: [...state.repeatedClicks],
      browserPin: state.browserPin ? { ...state.browserPin } : undefined,
    };
  }

  return { push, snapshot };
}
