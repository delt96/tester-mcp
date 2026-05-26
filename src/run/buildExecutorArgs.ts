export interface ExecutorArgsOptions {
  prompt: string; systemPrompt: string; model: string; permissionMode?: string;
}
export function buildExecutorArgs(o: ExecutorArgsOptions): string[] {
  return [
    "-p", o.prompt,
    "--chrome",
    "--model", o.model,
    "--append-system-prompt", o.systemPrompt,
    "--output-format", "json",
    "--permission-mode", o.permissionMode ?? "dontAsk",
    "--bare",
    "--no-session-persistence",
  ];
}
