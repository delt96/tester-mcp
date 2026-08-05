import { describe, it, expect } from "vitest";
import { captureEnv } from "../../src/env/captureEnv.js";

describe("captureEnv", () => {
  it("records commit from the injected gitSha, plus node/os", () => {
    const env = captureEnv({ model: "haiku", frontendDir: "/front", gitSha: (d) => d === "/front" ? "abc" : undefined });
    expect(env.frontend_commit).toBe("abc");
    expect(env.runner_model).toBe("haiku");
    expect(env.node_version).toBe(process.version);
    expect(env.os).toBe(process.platform);
  });
  it("does not throw when gitSha fails", () => {
    expect(captureEnv({ model: "haiku", gitSha: () => undefined }).frontend_commit).toBeUndefined();
  });
});
