import { test, expect } from "bun:test";
import { z } from "zod";
import { defineBackpack, BackpackStore, type Tool } from "../src/index.ts";

function fixture() {
  return defineBackpack({
    tools: [
      {
        id: "echo",
        name: "Echo",
        description: "Echo text",
        parameters: z.object({ text: z.string() }),
        handler: ({ text }: { text: string }) => `echo: ${text}`,
      },
    ],
    mcpServers: [
      {
        id: "db",
        name: "DB",
        description: "Postgres MCP",
        connection: { type: "stdio", command: "npx", args: ["pg-mcp"] },
      },
    ],
    agents: [
      { id: "reviewer", name: "Reviewer", description: "Reviews", systemPrompt: "Be terse." },
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
    skills: [{ id: "notes", name: "Notes", description: "Notes", body: "Do it." }],
    commands: [{ id: "triage", name: "Triage", description: "Triage", body: "Triage #$1" }],
  });
}

test("save then load round-trips the serializable capabilities", () => {
  const store = new BackpackStore(":memory:").init();
  store.save(fixture());

  const { backpack } = store.load({
    toolHandlers: { echo: ({ text }: { text: string }) => `echo: ${text}` },
  });

  expect(backpack.mcpServers[0]!.connection).toMatchObject({ type: "stdio", command: "npx" });
  expect(backpack.agents[0]!.systemPrompt).toBe("Be terse.");
  expect(backpack.hooks[0]!.matcher).toBe("Bash");
  expect(backpack.skills[0]!.body).toBe("Do it.");
  expect(backpack.commands[0]!.body).toBe("Triage #$1");
});

test("tools persist as JSON-Schema params and rebind their handler", async () => {
  const store = new BackpackStore(":memory:").init();
  store.save(fixture());

  const { backpack } = store.load({
    toolHandlers: { echo: ({ text }: { text: string }) => `handled: ${text}` },
  });

  const tool = backpack.tools[0]! as Tool;
  // parameters came back as a plain JSON-Schema object, not a zod schema.
  expect((tool.parameters as Record<string, unknown>).type).toBe("object");
  const result = await tool.handler({ text: "hi" } as never);
  expect(result).toBe("handled: hi");
});

test("missing handler yields a diagnostic and a throwing stub", async () => {
  const store = new BackpackStore(":memory:").init();
  store.save(fixture());

  const { backpack, diagnostics } = store.load(); // no toolHandlers
  expect(diagnostics.some((d) => d.capabilityId === "echo")).toBe(true);
  expect(() => (backpack.tools[0]! as Tool).handler({} as never)).toThrow();
});

test("upsert, list, remove and clear behave", () => {
  const store = new BackpackStore(":memory:").init();
  store.save(fixture());
  store.save(fixture()); // idempotent upsert, not duplicate rows

  expect(store.list("agents")).toHaveLength(1);
  expect(store.list().length).toBe(6);

  store.remove("agents", "reviewer");
  expect(store.list("agents")).toHaveLength(0);

  store.clear();
  expect(store.list()).toHaveLength(0);
});
