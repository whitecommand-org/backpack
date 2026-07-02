import { test, expect } from "bun:test";
import { z } from "zod";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeTools } from "../src/index.ts";
import type { Tool } from "../src/index.ts";

/** Send newline-delimited JSON-RPC requests to the generated server, collect replies. */
async function driveServer(serverPath: string, requests: unknown[]) {
  const proc = Bun.spawn(["bun", serverPath], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  proc.stdin.write(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await proc.stdin.end();

  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("generated MCP server lists and calls tools over stdio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backpack-mcp-"));

  // A tools module the generated server imports handlers from.
  await writeFile(
    join(dir, "tools.ts"),
    `export const tools = [{
       id: "add",
       handler: ({ a, b }) => String(a + b),
     }];\n`,
  );

  const tool: Tool = {
    id: "add",
    name: "Add",
    description: "Add two numbers",
    enabled: true,
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: () => "",
  };

  const { server, file } = materializeTools([tool], { toolsModule: "./tools.ts" });
  const serverPath = join(dir, "server.ts");
  await writeFile(serverPath, file.content);

  // The materialized server registers itself as a stdio `bun` server.
  expect(server.connection).toMatchObject({ type: "stdio", command: "bun" });

  const [initRes, listRes, callRes] = await driveServer(serverPath, [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } },
  ]);

  expect(initRes.result.serverInfo.name).toBe("backpack-tools");
  expect(listRes.result.tools[0].name).toBe("add");
  expect(listRes.result.tools[0].inputSchema.type).toBe("object");
  expect(callRes.result.content[0].text).toBe("5");
});
