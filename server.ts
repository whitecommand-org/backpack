import { createWebServer } from "./src/web/server.ts";

// Start the backpack web UI + multi-workspace JSON API. UI at `/`, API under
// `/api/*`. Workspaces are managed via `/api/workspaces`. No auth.
const port = Number(process.env.PORT ?? 4000);
const server = createWebServer({ port });

console.log(`backpack UI + API on http://localhost:${server.port}`);
