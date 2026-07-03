import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  run,
  WorkspaceRegistry,
  WorkspaceCatalog,
  defineBackpack,
  claudeCodeAdapter,
  writeFiles,
  type CliIO,
} from "../src/index.ts";

async function ctx(stdin = "") {
  const dir = await mkdtemp(join(tmpdir(), "backpack-cli-"));
  const registry = new WorkspaceRegistry();
  // Isolated catalog so tests never touch the real ~/.backpack/workspaces.json.
  const catalog = new WorkspaceCatalog(join(dir, "catalog.json"));
  let out = "";
  let err = "";
  const io: CliIO = {
    out: (t) => (out += t + "\n"),
    err: (t) => (err += t + "\n"),
    readStdin: async () => stdin,
  };
  const call = (...argv: string[]) =>
    run([...argv, "--dir", dir], { io, registry, catalog });
  return {
    dir,
    call,
    catalog,
    get out() {
      return out;
    },
    get err() {
      return err;
    },
    reset() {
      out = "";
      err = "";
    },
  };
}

const agentJson = JSON.stringify({
  id: "reviewer",
  name: "Reviewer",
  description: "Reviews diffs",
  systemPrompt: "Be terse.",
  model: "sonnet",
});

test("add → list → get → set → rm lifecycle", async () => {
  const c = await ctx();

  expect(await c.call("add", "agents", "--data", agentJson)).toBe(0);
  c.reset();

  expect(await c.call("list")).toBe(0);
  expect(c.out).toContain("agents");
  expect(c.out).toContain("model sonnet · all tools");
  c.reset();

  expect(await c.call("get", "agents", "reviewer")).toBe(0);
  expect(c.out).toContain("detail: model sonnet · all tools");
  c.reset();

  const updated = JSON.stringify({ ...JSON.parse(agentJson), model: "opus" });
  expect(await c.call("set", "agents", "reviewer", "--data", updated)).toBe(0);
  expect(c.out).toContain("model: opus");
  c.reset();

  expect(await c.call("rm", "agents", "reviewer")).toBe(0);
  expect(await c.call("get", "agents", "reviewer")).toBe(1); // gone
});

test("stdin input and --json output", async () => {
  const c = await ctx(agentJson);
  expect(await c.call("add", "agents")).toBe(0); // reads stdin
  c.reset();

  expect(await c.call("overview", "--json")).toBe(0);
  const parsed = JSON.parse(c.out);
  expect(parsed.total).toBe(1);
  expect(parsed.byKind.agents).toBe(1);
});

test("import from folder configs then export --write", async () => {
  const c = await ctx();
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
  await writeFiles(claudeCodeAdapter().emit(seed).files, { rootDir: c.dir });

  expect(await c.call("import")).toBe(0);
  expect(c.out).toContain("mcpServers=1");
  expect(c.out).toContain("agents=1");
  c.reset();

  expect(await c.call("export", "codex", "--write")).toBe(0);
  expect(await Bun.file(join(c.dir, ".codex/config.toml")).exists()).toBe(true);
});

test("populating a folder registers it in the (isolated) catalog", async () => {
  const c = await ctx();
  expect(await c.catalog.list()).toHaveLength(0);

  await c.call("add", "agents", "--data", agentJson);
  const entries = await c.catalog.list();
  expect(entries.map((e) => e.dir)).toEqual([c.dir]);

  // A failed mutation (tools are read-only) must NOT register the folder.
  const c2 = await ctx();
  await c2.call("add", "tools", "--data", '{"id":"t"}');
  expect(await c2.catalog.list()).toHaveLength(0);
});

test("errors: read-only tools, unknown kind, unknown command", async () => {
  const c = await ctx();
  expect(await c.call("add", "tools", "--data", '{"id":"t"}')).toBe(1);
  expect(c.err).toContain("read-only");
  c.reset();

  expect(await c.call("list", "nonsense")).toBe(1);
  c.reset();

  expect(await c.call("frobnicate")).toBe(1);
  expect(c.err).toContain("Unknown command");
});

test("targets and help need no folder", async () => {
  let out = "";
  const io: CliIO = { out: (t) => (out += t + "\n"), err: () => {}, readStdin: async () => "" };

  expect(await run(["targets"], { io })).toBe(0);
  expect(out).toContain("claude-code");

  out = "";
  expect(await run(["help"], { io })).toBe(0);
  expect(out).toContain("Usage: backpack");
});
