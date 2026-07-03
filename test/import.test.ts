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

test("claude-code import recovers metadata from strict-YAML-invalid frontmatter", async () => {
  // Real-world agent files have unquoted single-line descriptions containing
  // colons and quotes that Bun's strict YAML parser rejects. The lenient flat
  // fallback must recover name/description/model without a warning.
  const strictInvalid = [
    "---",
    "name: strategist",
    "description: Use this agent when: it's 'tricky' <example>x: y</example>",
    "model: sonnet",
    "---",
    "System prompt body.",
  ].join("\n");
  const r = new MemoryReader({ ".claude/agents/strategist.md": strictInvalid });

  const { capabilities, diagnostics } = await claudeCodeImporter().import(r);

  const agent = capabilities.agents?.[0]!;
  expect(agent.id).toBe("strategist");
  expect(agent.description).toBe("Use this agent when: it's 'tricky' <example>x: y</example>");
  expect(agent.model).toBe("sonnet");
  expect(agent.systemPrompt).toBe("System prompt body.");
  expect(diagnostics.some((d) => /invalid frontmatter/.test(d.message))).toBe(false);
});

test("claude-code import warns only when frontmatter yields nothing", async () => {
  // A genuinely unrecoverable frontmatter block (no key/value lines) still warns
  // and falls back to the filename-derived id.
  const garbage = ["---", "\t: [ : ] : {", "---", "Body."].join("\n");
  const r = new MemoryReader({ ".claude/agents/garbage.md": garbage });

  const { capabilities, diagnostics } = await claudeCodeImporter().import(r);

  expect(capabilities.agents?.[0]!.id).toBe("garbage");
  expect(diagnostics.some((d) => /invalid frontmatter in .*garbage\.md/.test(d.message))).toBe(true);
});

test("claude-code imports MCP servers from ~/.claude.json (user + project scope)", async () => {
  const root = "/home/dev/project";
  const claudeJson = JSON.stringify({
    mcpServers: {
      playwright: { command: "npx", args: ["@playwright/mcp"] },
      notion: { type: "http", url: "https://mcp.notion.com/mcp" },
    },
    projects: {
      [root]: { mcpServers: { context7: { command: "npx", args: ["-y", "c7"] } } },
      "/other/proj": { mcpServers: { unrelated: { command: "nope" } } },
    },
  });
  const reader = new MemoryReader({ ".claude.json": claudeJson }, "~", root);

  const { capabilities } = await claudeCodeImporter().import(reader);
  const ids = (capabilities.mcpServers ?? []).map((s) => s.id).sort();
  // user-scoped playwright/notion + this project's context7; NOT /other/proj's.
  expect(ids).toEqual(["context7", "notion", "playwright"]);
  const http = capabilities.mcpServers?.find((s) => s.id === "notion");
  expect(http?.connection.type).toBe("http");
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
