import { fileURLToPath } from "node:url";

// bin/ ships in the package, so the same relative path resolves from src/ (tsx) and dist/ (build).
// Forward slashes: a Git Bash style /c/... path does not start the server on Windows (measured 2026-09-28).
export const EXECUTOR_TOOLS_PATH = fileURLToPath(new URL("../../bin/executor-tools.cjs", import.meta.url)).replace(/\\/g, "/");
export const TESTER_SERVER = "tester";
export const APPROVER_TOOL = `mcp__${TESTER_SERVER}__approve`;
export const REPORT_STEPS_TOOL = `mcp__${TESTER_SERVER}__report_steps`;
export const REPORT_FINAL_TOOL = `mcp__${TESTER_SERVER}__report_final`;
