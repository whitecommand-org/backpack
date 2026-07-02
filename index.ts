import { z } from "zod";
import {
  defineBackpack,
  emit,
  claudeCodeAdapter,
  codexAdapter,
  copilotCliAdapter,
  toSdkBindings,
  type Tool,
} from "./src/index.ts";

/**
 * Custom tools. Exported as `tools` so the generated stdio MCP server (emitted at
 * `.backpack/mcp/backpack-tools.ts`) can import the live handlers by id.
 */
export const tools: Tool[] = [
  {
    id: "word-count",
    name: "Word Count",
    description: "Count the words in a piece of text",
    enabled: true,
    parameters: z.object({ text: z.string() }),
    handler: ({ text }: { text: string }) =>
      `word count: ${text.trim().split(/\s+/).filter(Boolean).length}`,
  },
];

/** One portable definition of every capability. */
const backpack = defineBackpack({
  tools,
  mcpServers: [
    {
      id: "github",
      name: "GitHub",
      description: "GitHub MCP server",
      connection: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
    },
  ],
  agents: [
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Reviews diffs for correctness and style",
      systemPrompt: "You are a meticulous code reviewer. Report only real issues.",
      tools: ["Read", "Grep"],
      model: "sonnet",
    },
  ],
  hooks: [
    {
      id: "block-force-push",
      name: "Block force push",
      description: "Reject git push --force",
      event: "PreToolUse",
      matcher: "Bash",
      handler: { type: "command", command: ".backpack/hooks/block-force-push.sh" },
    },
  ],
  skills: [
    {
      id: "release-notes",
      name: "Release Notes",
      description: "Generate release notes from merged PRs",
      body: "When asked for release notes:\n1. List merged PRs since the last tag.\n2. Group by type.",
    },
  ],
  commands: [
    {
      id: "triage",
      name: "Triage",
      description: "Triage an issue by number",
      body: "Triage issue #$1 and propose labels.",
      arguments: [{ name: "issue", hint: "issue number" }],
    },
  ],
});

// Emit for every CLI target.
const results = emit(backpack, [
  claudeCodeAdapter(),
  codexAdapter(),
  copilotCliAdapter(),
]);

for (const [tool, result] of Object.entries(results)) {
  console.log(`\n# ${tool}`);
  for (const file of result.files) console.log(`  file: ${file.path} (${file.scope})`);
  for (const d of result.diagnostics) console.log(`  ${d.level}: [${d.capabilityId}] ${d.message}`);
}

// SDK path keeps handlers live in-memory.
const sdk = toSdkBindings(backpack);
console.log(`\n# sdk\n  ${sdk.tools.length} tool(s), ${sdk.agents.length} agent(s), ${sdk.hooks.length} hook(s) bound in-process`);
