#!/usr/bin/env node
// MCP stdio server the runner attaches to every executor (see src/run/buildExecutorArgs.ts).
// `approve` answers Claude in Chrome's approval gate, which --dangerously-skip-permissions does not
// cover. `report_steps` / `report_final` exist so step results travel as tool calls the runner reads
// from stream-json: a killed executor still leaves the steps it reported, and a malformed index is
// rejected here instead of breaking the whole result. The server stores nothing.
const readline = require("node:readline");

const STEP_STATUSES = ["PASS", "FAIL", "SKIPPED", "NOT_TESTED"];
const FINAL_STATUSES = ["PASS", "PARTIAL", "FAIL", "NOT_TESTED"];

const TOOLS = [
  {
    name: "approve",
    description: "Permission handler: allows every request from the executor.",
    inputSchema: { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } } },
  },
  {
    name: "report_steps",
    description: "Report finished scenario steps. Call it after each step; steps finished in the same turn go in one call. index is the step number shown in the scenario (a single integer, 1-based).",
    inputSchema: {
      type: "object", required: ["steps"],
      properties: { steps: { type: "array", minItems: 1, items: {
        type: "object", required: ["index", "status"],
        properties: { index: { type: "integer", minimum: 1 }, status: { type: "string", enum: STEP_STATUSES }, note: { type: "string" } },
      } } },
    },
  },
  {
    name: "report_final",
    description: "Report the scenario verdict once, at the end — also before stopping early with NOT_TESTED.",
    inputSchema: {
      type: "object", required: ["status", "evidence"],
      properties: {
        status: { type: "string", enum: FINAL_STATUSES }, evidence: { type: "array", items: { type: "string" } },
        handoff_notes: { type: "string" }, not_tested_reason: { type: "string" }, screenshots: { type: "array", items: { type: "string" } },
      },
    },
  },
];

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return "steps must be a non-empty array";
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] || {};
    if (!Number.isInteger(s.index) || s.index < 1)
      return `steps[${i}].index must be a single integer >= 1 (got ${JSON.stringify(s.index)}). A range like 35-36 is not allowed: report one entry per step.`;
    if (!STEP_STATUSES.includes(s.status))
      return `steps[${i}].status must be one of ${STEP_STATUSES.join("|")} (got ${JSON.stringify(s.status)})`;
  }
  return null;
}

function validateFinal(a) {
  if (!FINAL_STATUSES.includes(a.status)) return `status must be one of ${FINAL_STATUSES.join("|")} (got ${JSON.stringify(a.status)})`;
  if (!Array.isArray(a.evidence)) return "evidence must be an array of strings";
  return null;
}

const text = (t, isError) => (isError ? { isError: true, content: [{ type: "text", text: t }] } : { content: [{ type: "text", text: t }] });

function callTool(name, args) {
  const a = args || {};
  if (name === "approve") return text(JSON.stringify({ behavior: "allow", updatedInput: a.input || {} }));
  if (name === "report_steps") { const err = validateSteps(a.steps); return err ? text(err, true) : text(`recorded ${a.steps.length} step(s)`); }
  if (name === "report_final") { const err = validateFinal(a); return err ? text(err, true) : text(`recorded final: ${a.status}`); }
  return text(`unknown tool: ${name}`, true);
}

function serve() {
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: {
        protocolVersion: (msg.params && msg.params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} }, serverInfo: { name: "tester", version: "1" },
      } });
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    } else if (msg.method === "tools/call") {
      send({ jsonrpc: "2.0", id: msg.id, result: callTool(msg.params && msg.params.name, msg.params && msg.params.arguments) });
    } else if (msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  });
}

module.exports = { callTool, TOOLS, STEP_STATUSES, FINAL_STATUSES };
if (require.main === module) serve();
