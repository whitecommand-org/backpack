import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WorkspaceRegistry,
  router,
  defineBackpack,
  claudeCodeAdapter,
  writeFiles,
} from "../src/index.ts";

async function ctx() {
  const dir = await mkdtemp(join(tmpdir(), "backpack-http-"));
  const registry = new WorkspaceRegistry();
  const handle = router(registry);

  async function call(
    method: string,
    path: string,
    opts: { body?: unknown; dir?: string | null; useHeader?: boolean } = {},
  ) {
    const headers = new Headers();
    let body: string | undefined;
    const withBody = method === "POST" || method === "PUT";
    const payload =
      withBody && opts.dir !== null
        ? { ...(opts.body as object), dir: opts.dir ?? dir }
        : opts.body;
    if (withBody) {
      body = JSON.stringify(payload ?? {});
      headers.set("content-type", "application/json");
    } else if (opts.dir !== null) {
      headers.set("x-backpack-dir", opts.dir ?? dir);
    }
    const res = await handle(new Request(`http://x${path}`, { method, headers, body }));
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  return { dir, call };
}

const agent = {
  id: "reviewer",
  name: "Reviewer",
  description: "Reviews diffs",
  systemPrompt: "Be terse.",
};

test("health and missing-dir handling", async () => {
  const { call } = await ctx();
  expect((await call("GET", "/health")).json).toEqual({ ok: true });
  expect((await call("GET", "/overview", { dir: null })).status).toBe(400);
});

test("full CRUD lifecycle on a writable kind", async () => {
  const { call } = await ctx();

  const created = await call("POST", "/capabilities/agents", { body: agent });
  expect(created.status).toBe(201);
  expect(created.json.detail).toBe("model inherit · all tools");

  expect((await call("GET", "/overview")).json.total).toBe(1);
  const list = await call("GET", "/capabilities");
  expect(list.json.capabilities.map((c: any) => c.id)).toEqual(["reviewer"]);

  const detail = await call("GET", "/capabilities/agents/reviewer");
  expect(detail.json.fields.model).toBe("inherit");

  const updated = await call("PUT", "/capabilities/agents/reviewer", {
    body: { ...agent, description: "Reviews carefully", model: "opus" },
  });
  expect(updated.json.fields.model).toBe("opus");

  expect((await call("DELETE", "/capabilities/agents/reviewer")).status).toBe(204);
  expect((await call("GET", "/capabilities/agents/reviewer")).status).toBe(404);
});

test("validation, read-only tools, and bad kind", async () => {
  const { call } = await ctx();
  expect((await call("POST", "/capabilities/agents", { body: { id: "x" } })).status).toBe(422);
  expect((await call("POST", "/capabilities/tools", { body: { id: "t" } })).status).toBe(400);
  expect((await call("GET", "/capabilities/nonsense")).status).toBe(400);
});

test("import from the folder's configs, then export to a target", async () => {
  const { dir, call } = await ctx();

  // Seed the folder with a Claude config to import.
  const seed = defineBackpack({
    mcpServers: [
      {
        id: "linear",
        name: "Linear",
        description: "Linear MCP",
        connection: { type: "http", url: "https://mcp.linear.app/mcp" },
      },
    ],
    agents: [{ id: "helper", name: "Helper", description: "Helps", systemPrompt: "Help." }],
  });
  await writeFiles(claudeCodeAdapter().emit(seed).files, { rootDir: dir });

  const imported = await call("POST", "/import", { body: {} });
  expect(imported.json.imported.mcpServers).toBe(1);
  expect(imported.json.imported.agents).toBe(1);

  const overview = await call("GET", "/overview");
  expect(overview.json.byKind.mcpServers).toBe(1);
  expect(overview.json.byKind.agents).toBe(1);

  const exported = await call("POST", "/export", { body: { target: "codex", write: true } });
  expect(exported.json.written.some((p: string) => p.endsWith(".codex/config.toml"))).toBe(true);
  expect(await Bun.file(join(dir, ".codex/config.toml")).exists()).toBe(true);
});

test("targets lists exporter support matrix without a folder", async () => {
  const { call } = await ctx();
  const res = await call("GET", "/targets");
  expect(res.json.targets.map((t: any) => t.id).sort()).toEqual([
    "claude-code",
    "codex",
    "copilot-cli",
  ]);
});
