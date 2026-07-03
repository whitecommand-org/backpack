import index from "./index.html";
import { WorkspaceRegistry, WorkspaceCatalog } from "../infrastructure/index.ts";
import { router } from "../http/router.ts";

export interface WebServerOptions {
  port?: number;
  registry?: WorkspaceRegistry;
  catalog?: WorkspaceCatalog;
}

/**
 * Serve the web UI at `/` and the JSON API under `/api/*` (delegated to the shared
 * router with the `/api` prefix stripped). `Bun.serve` bundles the React/Tailwind
 * app from the imported HTML entry.
 */
export function createWebServer(opts: WebServerOptions = {}) {
  const registry = opts.registry ?? new WorkspaceRegistry();
  const catalog = opts.catalog ?? new WorkspaceCatalog();
  const handle = router(registry, catalog);

  return Bun.serve({
    port: opts.port ?? 4000,
    development: { hmr: true, console: true },
    routes: {
      "/": index,
      "/api/*": (req: Request) => handle(stripApiPrefix(req)),
    },
  });
}

function stripApiPrefix(req: Request): Request {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api/, "") || "/";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: req.headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }
  return new Request(url.href, init);
}
