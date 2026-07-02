import { test, expect } from "bun:test";
import { z } from "zod";
import { parse as parseToml } from "@iarna/toml";
import {
  defineBackpack,
  claudeCodeAdapter,
  codexAdapter,
  copilotCliAdapter,
  toSdkBindings,
  type Tool,
} from "../src/index.ts";

const tools: Tool[] = [
  {
    id: "echo",
    name: "Echo",
    description: "Echo text back",
    enabled: true,
    parameters: z.object({ text: z.string() }),
    handler: ({ text }: { text: string }) => `echo: ${text}`,
  },
];

function fixture() {
  return defineBackpack({
    tools,
    mcpServers: [
      {
        id: "db",
        name: "DB",
        description: "Postgres MCP",
        connection: { type: "stdio", command: "npx", args: ["pg-mcp"] },
      },
    ],
    agents: [
      {
        id: "reviewer",
        name: "Reviewer",
        description: "Reviews code",
        systemPrompt: "Be terse.",
        tools: ["Read", "Grep"],
      },
    ],
    hooks: [
      {
        id: "guard",
        name: "Guard",
        description: "Guard bash",
        event: "PreToolUse",
        matcher: "Bash",
        handler: { type: "command", command: "./guard.sh" },
      },
    ],
    skills: [
      { id: "notes", name: "Notes", description: "Make notes", body: "Do the thing." },
    ],
    commands: [
      {
        id: "triage",
        name: "Triage",
        description: "Triage issue",
        body: "Triage #$1",
        arguments: [{ name: "issue" }],
      },
    ],
  });
}

const fileMap = (files: { path: string; content: string }[]) =>
  new Map(files.map((f) => [f.path, f.content]));

test("core rejects duplicate ids and unknown skill refs", () => {
  expect(() =>
    defineBackpack({
      skills: [
        { id: "a", name: "A", description: "d", body: "b" },
        { id: "a", name: "A2", description: "d", body: "b" },
      ],
    }),
  ).toThrow();

  expect(() =>
    defineBackpack({
      agents: [
        { id: "x", name: "X", description: "d", systemPrompt: "p", skills: ["missing"] },
      ],
    }),
  ).toThrow();
});

test("claude-code emits valid config files", () => {
  const { files, diagnostics } = claudeCodeAdapter().emit(fixture());
  const map = fileMap(files);
  expect(diagnostics).toHaveLength(0);

  const mcp = JSON.parse(map.get(".mcp.json")!);
  expect(mcp.mcpServers.db).toEqual({ command: "npx", args: ["pg-mcp"] });
  // Materialized tools server is registered and its file emitted.
  expect(mcp.mcpServers["backpack-tools"].command).toBe("bun");
  expect(map.has(".backpack/mcp/backpack-tools.ts")).toBe(true);

  expect(map.get(".claude/agents/reviewer.md")).toContain("name: reviewer");
  expect(map.get(".claude/agents/reviewer.md")).toContain("tools: Read, Grep");
  expect(map.get(".claude/skills/notes/SKILL.md")).toContain("description: Make notes");
  expect(map.get(".claude/commands/triage.md")).toContain('argument-hint: "[issue]"');

  const settings = JSON.parse(map.get(".claude/settings.json")!);
  expect(settings.hooks.PreToolUse[0].matcher).toBe("Bash");
  expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("./guard.sh");
});

test("codex emits parseable TOML with warnings for agents/skills", () => {
  const { files, diagnostics } = codexAdapter().emit(fixture());
  const map = fileMap(files);
  const toml = parseToml(map.get(".codex/config.toml")!) as any;

  expect(toml.mcp_servers.db.command).toBe("npx");
  expect(toml.mcp_servers["backpack-tools"].command).toBe("bun");
  expect(toml.agents.reviewer.description).toBe("Reviews code");
  expect(toml.hooks.PreToolUse[0].hooks[0].command).toBe("./guard.sh");
  expect(map.get(".codex/prompts/triage.md")).toContain("Triage #$1");

  expect(diagnostics.map((d) => d.capabilityId).sort()).toEqual(["notes", "reviewer"]);
});

test("copilot emits mcp-config + agents, warns on skill and command", () => {
  const { files, diagnostics } = copilotCliAdapter().emit(fixture());
  const map = fileMap(files);

  const mcp = JSON.parse(map.get(".copilot/mcp-config.json")!);
  expect(mcp.mcpServers.db.type).toBe("local");
  expect(map.get(".github/agents/reviewer.md")).toContain("name: reviewer");
  expect(map.get(".github/agents/notes.md")).toContain("Do the thing.");

  const ids = diagnostics.map((d) => d.capabilityId).sort();
  expect(ids).toEqual(["notes", "triage"]);
});

test("sdk bindings keep live handlers", async () => {
  const sdk = toSdkBindings(fixture());
  expect(sdk.tools[0]!.name).toBe("echo");
  expect((sdk.tools[0]!.inputSchema as any).type).toBe("object");
  const result = await sdk.tools[0]!.handler({ text: "hi" } as never);
  expect(result).toBe("echo: hi");
});
