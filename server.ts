import { createBackpackServer } from "./src/index.ts";

// Start the multi-workspace backpack HTTP API. Each request names its folder via
// the `dir` body field, `?dir=`, or an `X-Backpack-Dir` header. No auth.
const port = Number(process.env.PORT ?? 4000);
const server = createBackpackServer({ port });

console.log(`backpack API listening on http://localhost:${server.port}`);
console.log("Try: curl -H 'X-Backpack-Dir: .' http://localhost:" + server.port + "/overview");
