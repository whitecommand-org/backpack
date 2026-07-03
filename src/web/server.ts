import index from "./index.html";
import { WorkspaceRegistry, WorkspaceCatalog } from "../infrastructure/index.ts";
import { router } from "../http/router.ts";

export interface WebServerOptions {
  port?: number;
  registry?: WorkspaceRegistry;
  catalog?: WorkspaceCatalog;
}

/**
 * Serve the web UI at `/` and the JSON API under `/api/*`. The router is given the
 * `/api` base path so it strips the prefix while receiving the **original** request
 * (body intact) — no request rebuilding. `Bun.serve` bundles the React/Tailwind app
 * from the imported HTML entry.
 */
export function createWebServer(opts: WebServerOptions = {}) {
  const registry = opts.registry ?? new WorkspaceRegistry();
  const catalog = opts.catalog ?? new WorkspaceCatalog();
  const handle = router(registry, catalog, { basePath: "/api" });

  return Bun.serve({
    port: opts.port ?? 4000,
    development: { hmr: true, console: true },
    routes: {
      "/": index,
      "/api/*": (req: Request) => handle(req),
    },
  });
}
