# backpack

A **portable backpack for AI coding-agent capabilities**. Declare each capability
once in a tool-agnostic core, and let **adapters emit the native config files** for
Claude Code, Codex CLI, GitHub Copilot CLI, and the SDKs.

```bash
bun install
bun run index.ts   # emits configs for every target and prints the file list
bun test
```

## Capabilities

| Capability | What it is |
|---|---|
| `mcpServers` | MCP servers (stdio / http). |
| `tools` | Custom function tools. Materialized into a generated stdio MCP server so any CLI can use them — no hand-written MCP config. |
| `agents` | Subagents with their own system prompt, tools and model. |
| `hooks` | Shell-command lifecycle hooks on a normalized event set. |
| `skills` | On-demand knowledge/procedures ([Agent Skills](https://agentskills.io) standard). |
| `commands` | Reusable named slash-command prompts with arguments. |

The core is a single set of **zod schemas** (`src/core/schemas`); TypeScript types are
`z.infer`red from them. `defineBackpack()` validates input, applies defaults, and checks
unique ids and cross-references.

## Usage

```ts
import { z } from "zod";
import {
  defineBackpack, emit, writeFiles,
  claudeCodeAdapter, codexAdapter, copilotCliAdapter, toSdkBindings,
  type Tool,
} from "./src/index.ts";

// Export `tools` so the generated MCP server can import the live handlers.
export const tools: Tool[] = [{
  id: "word-count",
  name: "Word Count",
  description: "Count words in text",
  parameters: z.object({ text: z.string() }),
  handler: ({ text }) => `words: ${text.trim().split(/\s+/).length}`,
}];

const backpack = defineBackpack({
  tools,
  agents: [{ id: "reviewer", name: "Reviewer", description: "Reviews diffs",
             systemPrompt: "Be terse.", tools: ["Read", "Grep"] }],
  // ...mcpServers, hooks, skills, commands
});

const results = emit(backpack, [
  claudeCodeAdapter(), codexAdapter(), copilotCliAdapter(),
]);
await writeFiles(results["claude-code"].files, { rootDir: process.cwd() });

// Runtime (SDK) path keeps handlers live in-process instead of emitting files:
const sdk = toSdkBindings(backpack);
```

## What each adapter emits

- **Claude Code** → `.mcp.json`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`,
  `.claude/commands/*.md`, `.claude/settings.json` (hooks).
- **Codex CLI** → `.codex/config.toml` (`[mcp_servers.*]`, `[agents.*]`, `[[hooks.*]]`),
  `.codex/prompts/*.md`.
- **Copilot CLI** → `.copilot/mcp-config.json`, `.github/agents/*.md`, `.copilot/settings.json`.
- **SDK** → in-memory bindings (`toSdkBindings`), handlers stay live.

`emit()` is pure — it returns file contents and **diagnostics** (never throws) when a
target can't express a capability (e.g. Copilot has no skills; Codex agents have no
inline system prompt). Inspect an adapter's `supports` to see coverage up front.

## Layout

```
src/
  core/        zod schemas (source of truth) + Adapter contract + defineBackpack()
  adapters/    claude-code, codex, copilot-cli, sdk, shared (yaml/toml/tool→mcp)
index.ts       runnable demo defining one backpack and emitting all targets
```
