import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  defineBackpack,
  BackpackStore,
  exportBundle,
  importBundle,
  run,
  WorkspaceRegistry,
  WorkspaceCatalog,
  type CliIO,
} from "../src/index.ts";

function seededStore() {
  const store = new BackpackStore(":memory:").init();
  store.save(
    defineBackpack({
      tools: [
        {
          id: "echo",
          name: "Echo",
          description: "Echo text",
          parameters: z.object({ text: z.string() }),
          handler: ({ text }: { text: string }) => text,
        },
      ],
      mcpServers: [
        {
          id: "db",
          name: "DB",
          description: "Postgres",
          connection: { type: "stdio", command: "npx", args: ["pg-mcp"] },
        },
      ],
      agents: [
        { id: "reviewer", name: "Reviewer", description: "Reviews", systemPrompt: "Be terse." },
      ],
    }),
  );
  return store;
}

test("exportBundle captures every kind; tool has params but no handler", () => {
  const bundle = exportBundle(seededStore());
  expect(bundle.format).toBe("backpack-bundle");
  expect(bundle.version).toBe(1);
  expect(bundle.capabilities.mcpServers).toHaveLength(1);
  expect(bundle.capabilities.agents).toHaveLength(1);

  const tool = bundle.capabilities.tools[0] as any;
  expect(tool.id).toBe("echo");
  expect(tool.parameters.type).toBe("object"); // JSON Schema
  expect(tool.handler).toBeUndefined();
});

test("importBundle loads into a fresh store; merge is idempotent, replace clears", () => {
  const bundle = exportBundle(seededStore());

  const target = new BackpackStore(":memory:").init();
  const first = importBundle(target, bundle);
  expect(first.imported.mcpServers).toBe(1);
  expect(first.imported.agents).toBe(1);
  expect(first.imported.tools).toBe(1);
  expect(target.list().length).toBe(3);

  // Merge again → still 3 rows (upsert, not duplicate).
  importBundle(target, bundle);
  expect(target.list().length).toBe(3);

  // Replace with a bundle that has only the agent → store ends with just that.
  const smaller = { ...bundle, capabilities: { ...emptyKinds(), agents: bundle.capabilities.agents } };
  importBundle(target, smaller, { replace: true });
  expect(target.list().map((r) => `${r.kind}/${r.id}`)).toEqual(["agents/reviewer"]);
});

test("malformed capabilities are skipped with a diagnostic; wrong format throws", () => {
  const target = new BackpackStore(":memory:").init();
  const bundle = {
    format: "backpack-bundle",
    version: 1,
    capabilities: {
      ...emptyKinds(),
      agents: [
        { id: "ok", name: "Ok", description: "d", systemPrompt: "p" },
        { id: "bad", name: "Bad" }, // missing description/systemPrompt
      ],
    },
  };
  const { imported, diagnostics } = importBundle(target, bundle);
  expect(imported.agents).toBe(1);
  expect(diagnostics.some((d) => d.capabilityId === "bad")).toBe(true);

  expect(() => importBundle(target, { format: "nope", version: 1, capabilities: {} })).toThrow();
});

test("CLI round-trips a bundle between two workspaces", async () => {
  const dirA = await mkdtemp(join(tmpdir(), "bundle-a-"));
  const dirB = await mkdtemp(join(tmpdir(), "bundle-b-"));
  const bundlePath = join(await mkdtemp(join(tmpdir(), "bundle-f-")), "backpack.json");

  const registry = new WorkspaceRegistry();
  const catalog = new WorkspaceCatalog(join(dirA, "catalog.json"));
  let out = "";
  const io: CliIO = { out: (t) => (out += t + "\n"), err: () => {}, readStdin: async () => "" };
  const cli = (...argv: string[]) => run(argv, { io, registry, catalog });

  // Seed workspace A with an agent.
  await cli("add", "agents", "--dir", dirA, "--data", JSON.stringify({
    id: "reviewer", name: "Reviewer", description: "Reviews", systemPrompt: "Be terse.",
  }));

  expect(await cli("bundle", "export", "--dir", dirA, "--out", bundlePath)).toBe(0);
  expect(await Bun.file(bundlePath).exists()).toBe(true);

  // Import into a *different* workspace B.
  out = "";
  expect(await cli("bundle", "import", bundlePath, "--dir", dirB)).toBe(0);

  out = "";
  await cli("overview", "--dir", dirB, "--json");
  expect(JSON.parse(out).byKind.agents).toBe(1);
});

function emptyKinds() {
  return { mcpServers: [], tools: [], agents: [], hooks: [], skills: [], commands: [] };
}
