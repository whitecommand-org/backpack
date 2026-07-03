import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceRegistry, WorkspaceCatalog, router } from "../src/index.ts";

async function ctx() {
  const base = await mkdtemp(join(tmpdir(), "backpack-ws-"));
  const catalog = new WorkspaceCatalog(join(base, "workspaces.json"));
  const handle = router(new WorkspaceRegistry(), catalog);

  async function call(method: string, path: string, body?: unknown) {
    const res = await handle(
      new Request(`http://x${path}`, {
        method,
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  return { base, call };
}

test("workspaces: add, list with counts, delete", async () => {
  const { base, call } = await ctx();
  const projectA = await mkdtemp(join(tmpdir(), "backpack-projA-"));

  const added = await call("POST", "/workspaces", { dir: projectA });
  expect(added.status).toBe(201);
  expect(added.json.dir).toBe(projectA);
  expect(added.json.total).toBe(0);

  const list = await call("GET", "/workspaces");
  expect(list.json.workspaces.map((w: any) => w.dir)).toContain(projectA);

  // Create a capability in that workspace → count reflects it.
  await call("POST", "/capabilities/agents", {
    dir: projectA,
    id: "reviewer",
    name: "Reviewer",
    description: "Reviews",
    systemPrompt: "Be terse.",
  });
  const after = await call("GET", "/workspaces");
  const entry = after.json.workspaces.find((w: any) => w.dir === projectA);
  expect(entry.total).toBe(1);
  expect(entry.byKind.agents).toBe(1);

  const removed = await call("DELETE", `/workspaces?dir=${encodeURIComponent(projectA)}`);
  expect(removed.status).toBe(204);
  expect((await call("GET", "/workspaces")).json.workspaces).toHaveLength(0);

  void base;
});

test("adding a duplicate folder is idempotent", async () => {
  const { call } = await ctx();
  const project = await mkdtemp(join(tmpdir(), "backpack-projB-"));
  await call("POST", "/workspaces", { dir: project });
  await call("POST", "/workspaces", { dir: project });
  expect((await call("GET", "/workspaces")).json.workspaces).toHaveLength(1);
});

test("POST /workspaces without a dir is a 400", async () => {
  const { call } = await ctx();
  expect((await call("POST", "/workspaces", {})).status).toBe(400);
});
