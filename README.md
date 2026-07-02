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

## Import — adopt existing configs

The inverse of `emit`: read a user's existing tool configs back into a `Backpack`.
Uses Bun's built-in `Bun.TOML.parse` / `Bun.YAML.parse` — no extra deps.

```ts
import {
  importBackpack, diskReaders,
  claudeCodeImporter, codexImporter, copilotCliImporter,
} from "./src/index.ts";

const { backpack, diagnostics } = await importBackpack(
  [claudeCodeImporter(), codexImporter(), copilotCliImporter()],
  diskReaders(), // scans the project dir AND the user's home dir (~/.claude, ~/.codex, ~/.copilot)
);
```

Import is honest about what configs can't carry: a tool's live `handler` is never in a
config, so **importing never yields `tools`** (a materialized tool-server is detected and
skipped); Codex agents have no recoverable system prompt. Such losses surface as
diagnostics. Merge is by id per kind (first-wins). This enables migration:
**import from Claude Code → `emit` to Copilot**.

## SQLite storage — a durable backpack

```ts
import { BackpackStore } from "./src/index.ts";

const store = new BackpackStore("backpack.db").init();
store.save(backpack);                       // upsert every capability
const { backpack: reloaded } = store.load({ // reload later
  toolHandlers: { "word-count": handler },  // re-bind live handlers by id
});
store.list();           // capability metadata
store.remove("agents", "reviewer");
```

Every capability is one row in a generic `capabilities` table. Tools persist as
metadata + JSON-Schema `parameters` (the `handler` can't be serialized), so `load`
takes a `toolHandlers` map to re-attach them; unbound tools get a throwing stub + a
diagnostic. This is why `Tool.parameters` accepts a zod schema **or** a JSON-Schema
object. Typical flow: **import → save → load → emit**.

## Layout

```
src/
  core/        zod schemas (source of truth) + Adapter/Importer contracts + defineBackpack()
  adapters/    claude-code, codex, copilot-cli, sdk (emit + import), shared (yaml/toml/reader/tool→mcp)
  store/       bun:sqlite BackpackStore (save/load/list/remove/clear)
index.ts       runnable demo: define → emit → import → save/load
```
