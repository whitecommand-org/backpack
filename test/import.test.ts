import { test, expect } from "bun:test";
import { z } from "zod";
import {
  defineBackpack,
  claudeCodeAdapter,
  codexAdapter,
  copilotCliAdapter,
  claudeCodeImporter,
  codexImporter,
  copilotCliImporter,
  importBackpack,
  MemoryReader,
  type Tool,
  type EmittedFile,
} from "../src/index.ts";

const tools: Tool[] = [
  {
    id: "echo",
    name: "Echo",
    description: "Echo text",
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
        model: "sonnet",
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
    skills: [{ id: "notes", name: "Notes", description: "Make notes", body: "Do it." }],
    commands: [
      {
        id: "triage",
        name: "Triage",
        description: "Triage issue",
        body: "Triage #$1",
        arguments: [{ name: "issue", hint: "number" }],
      },
    ],
  });
}

const reader = (files: EmittedFile[]) =>
  new MemoryReader(Object.fromEntries(files.map((f) => [f.path, f.content])));

test("claude-code round-trips through emit → import", async () => {
  const { files } = claudeCodeAdapter().emit(fixture());
  const { capabilities, diagnostics } = await claudeCodeImporter().import(reader(files));

  // The generated tools-server is skipped, leaving only the real MCP server.
  expect(capabilities.mcpServers?.map((s) => s.id)).toEqual(["db"]);
  expect(diagnostics.some((d) => /generated tools-server/.test(d.message))).toBe(true);

  const agent = capabilities.agents?.[0]!;
  expect(agent.id).toBe("reviewer");
  expect(agent.systemPrompt).toBe("Be terse.");
  expect(agent.tools).toEqual(["Read", "Grep"]);
  expect(agent.model).toBe("sonnet");

  expect(capabilities.skills?.[0]!.body).toBe("Do it.");
  const command = capabilities.commands?.[0]!;
  expect(command.id).toBe("triage");
  expect(command.arguments).toEqual([{ name: "issue", hint: "number" }]);

  const hook = capabilities.hooks?.[0]!;
  expect(hook.event).toBe("PreToolUse");
  expect(hook.matcher).toBe("Bash");
  expect(hook.handler.command).toBe("./guard.sh");
});

test("codex import recovers servers, agents (lossy) and prompts", async () => {
  const { files } = codexAdapter().emit(fixture());
  const { capabilities, diagnostics } = await codexImporter().import(reader(files));

  expect(capabilities.mcpServers?.map((s) => s.id)).toEqual(["db"]);
  expect(capabilities.agents?.[0]!.description).toBe("Reviews code");
  // Codex prompts carry both the command and the skill (indistinguishable).
  expect(capabilities.commands?.map((c) => c.id).sort()).toEqual(["notes", "triage"]);
  expect(diagnostics.some((d) => /no recoverable system prompt/.test(d.message))).toBe(true);
});

test("copilot import recovers servers and agents", async () => {
  const { files } = copilotCliAdapter().emit(fixture());
  const { capabilities } = await copilotCliImporter().import(reader(files));

  expect(capabilities.mcpServers?.[0]!.connection.type).toBe("stdio");
  // Both the real agent and the skill-as-agent come back as agents.
  expect(capabilities.agents?.map((a) => a.id).sort()).toEqual(["notes", "reviewer"]);
});

test("importBackpack merges multiple importers into one valid Backpack", async () => {
  const claudeFiles = claudeCodeAdapter().emit(fixture()).files;
  const r = reader(claudeFiles);
  const { backpack, diagnostics } = await importBackpack(
    [claudeCodeImporter(), codexImporter(), copilotCliImporter()],
    [r],
  );

  expect(backpack.mcpServers.map((s) => s.id)).toEqual(["db"]);
  expect(backpack.agents.map((a) => a.id)).toContain("reviewer");
  // No tools (handlers can't be imported); merge stayed valid.
  expect(backpack.tools).toHaveLength(0);
  expect(Array.isArray(diagnostics)).toBe(true);
});
