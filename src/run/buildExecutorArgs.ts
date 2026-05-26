export interface ExecutorArgsOptions {
  prompt: string; systemPrompt: string; model: string;
}
export function buildExecutorArgs(o: ExecutorArgsOptions): string[] {
  // Flag set verified by live smoke tests against claude -p --chrome:
  // - --dangerously-skip-permissions: required so chrome tools (navigate/click) auto-run.
  //   (--permission-mode dontAsk BLOCKS them → executor stalls on a permission prompt.)
  // - NO --bare: --bare skips auth context too → executor fails with "Not logged in".
  return [
    "-p", o.prompt,
    "--chrome",
    "--model", o.model,
    "--append-system-prompt", o.systemPrompt,
    "--output-format", "json",
    "--dangerously-skip-permissions",
    "--no-session-persistence",
  ];
}
