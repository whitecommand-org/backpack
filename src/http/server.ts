import { WorkspaceRegistry } from "../infrastructure/index.ts";
import { router } from "./router.ts";

export interface ServerOptions {
  port?: number;
  registry?: WorkspaceRegistry;
}

/**
 * Start the backpack HTTP API. The router is a pure function, so tests can drive
 * it directly without opening a socket; here we hand it to `Bun.serve`.
 */
export function createBackpackServer(opts: ServerOptions = {}) {
  const registry = opts.registry ?? new WorkspaceRegistry();
  return Bun.serve({
    port: opts.port ?? 4000,
    fetch: router(registry),
  });
}
