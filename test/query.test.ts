import { test, expect } from "bun:test";
import { defineBackpack, BackpackStore, BackpackQueryService } from "../src/index.ts";

function seed() {
  const store = new BackpackStore(":memory:").init();
  store.save(
    defineBackpack({
      mcpServers: [
        {
          id: "db",
          name: "DB",
          description: "Postgres",
          connection: { type: "stdio", command: "npx", args: ["pg-mcp"] },
        },
      ],
      agents: [
        {
          id: "reviewer",
          name: "Reviewer",
          description: "Reviews",
          systemPrompt: "Be terse.",
          tools: ["Read", "Grep"],
          model: "sonnet",
        },
      ],
      hooks: [
        {
          id: "guard",
          name: "Guard",
          description: "guard",
          event: "PreToolUse",
          matcher: "Bash",
          handler: { type: "command", command: "./guard.sh" },
        },
      ],
    }),
  );
  return new BackpackQueryService(store);
}

test("overview counts capabilities by kind", () => {
  const overview = seed().overview();
  expect(overview.total).toBe(3);
  expect(overview.byKind.mcpServers).toBe(1);
  expect(overview.byKind.agents).toBe(1);
  expect(overview.byKind.tools).toBe(0);
});

test("list produces readable one-line summaries", () => {
  const query = seed();
  const byId = Object.fromEntries(query.list().map((c) => [c.id, c.detail]));
  expect(byId.db).toBe("stdio: npx pg-mcp");
  expect(byId.reviewer).toBe("model sonnet · 2 tools");
  expect(byId.guard).toBe("PreToolUse Bash → ./guard.sh");
});

test("list filters by kind and search term", () => {
  const query = seed();
  expect(query.list({ kind: "agents" })).toHaveLength(1);
  expect(query.list({ q: "postgres" }).map((c) => c.id)).toEqual(["db"]);
});

test("get returns kind-specific readable detail fields", () => {
  const detail = seed().get("mcpServers", "db")!;
  expect(detail.fields.transport).toBe("stdio");
  expect(detail.fields.endpoint).toBe("npx pg-mcp");
  expect(seed().get("agents", "missing")).toBeNull();
});
