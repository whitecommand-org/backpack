# backpack

A **portable backpack for AI coding-agent capabilities**. Declare each capability
once in a tool-agnostic core, and let **adapters emit the native config files** for
Claude Code, Codex CLI, GitHub Copilot CLI, and the SDKs.

```bash
bun install
bun run index.ts   # emits configs for every target and prints the file list
bun server.ts      # start the HTTP API (default :4000)
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
  diskReaders(), // scans the project dir AND the user's home dir
);
// Claude MCP servers are read from `.mcp.json` and `~/.claude.json` (both the
// top-level user-scoped `mcpServers` and the `projects[<dir>].mcpServers` entry).
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

## HTTP API — manage a backpack in any folder

`bun server.ts` starts a **multi-workspace** API (no auth): each request names the
folder it operates on via a `dir` body field, `?dir=`, or an `X-Backpack-Dir` header.
The store lives at `<dir>/.backpack/backpack.db`.

| Method + path | Action |
|---|---|
| `GET /health` · `GET /targets` | liveness · exporter support matrix |
| `GET /overview` | capability counts by kind |
| `GET /capabilities?kind=&q=` | readable summaries |
| `GET /capabilities/:kind/:id` | readable detail |
| `POST /capabilities/:kind` · `PUT …/:id` · `DELETE …/:id` | create · update · delete |
| `POST /import` `{ targets? }` | import the folder's configs into the store |
| `POST /export` `{ target, write? }` | emit a target's config (optionally write to the folder) |

```bash
curl -X POST localhost:4000/capabilities/agents -H 'content-type: application/json' \
  -d '{"dir":"/path/to/project","id":"reviewer","name":"Reviewer",
       "description":"Reviews diffs","systemPrompt":"Be terse.","model":"sonnet"}'
curl -H 'X-Backpack-Dir: /path/to/project' localhost:4000/capabilities
#  → { "capabilities": [ { "id":"reviewer", "detail":"model sonnet · all tools", … } ] }
```

Tools are **read-only** over HTTP (a handler can't be sent as JSON). Errors are
`{ error: { code, message, details? } }` (400/404/409/422).

## Web UI

`bun server.ts` (or `bun cli.ts serve`) starts a black-on-white, monochrome web console
modeled on [whitecommand.com](https://whitecommand.com) — React + Tailwind v4 served by
`Bun.serve` (HTML imports, no vite). It serves the app at `/` and the JSON API under
`/api/*`.

- **Workspaces** are tracked in a server-side registry (`~/.backpack/workspaces.json`, via
  `/api/workspaces`). Add one by typing a folder path; switch between them in the left rail.
- **Overview** shows one stat card per kind; **Capabilities** lists readable rows with a
  filter/search and a detail drawer; create/edit uses **guided per-kind forms** with a raw-JSON
  fallback (tools are read-only). **Import / Export** run against the active folder with
  terminal-styled output.

```bash
bun server.ts          # http://localhost:4000
```

## CLI

`bun cli.ts <command>` (or `backpack` once installed) operates on one folder — `--dir`,
default the current directory. It's **embedded** (talks to the folder's SQLite directly, no
server) and shares the exact services and readable output as the HTTP API.

```bash
bun cli.ts overview --dir ./project
bun cli.ts list agents                       # readable summaries; add --json for scripting
echo '{"id":"reviewer","name":"Reviewer","description":"Reviews diffs",
       "systemPrompt":"Be terse.","model":"sonnet"}' | bun cli.ts add agents
bun cli.ts get agents reviewer
bun cli.ts import                             # adopt the folder's existing tool configs
bun cli.ts export codex --write               # write .codex/config.toml into the folder
bun cli.ts targets                            # export targets and their supported kinds
bun cli.ts serve --port 4000                  # start the HTTP API
```

Commands: `overview`, `list [kind]`, `get <kind> <id>`, `add <kind>`, `set <kind> <id>`,
`rm <kind> <id>`, `import`, `export <target>`, `targets`, `serve`, `help`. Capability input
for `add`/`set` is JSON via `--data`, `--file`, or stdin. Tools are read-only. Exit code is
non-zero on error.

## Architecture (hexagonal)

```
src/
  core/            DOMAIN — zod schemas, defineBackpack, Adapter/Importer contracts
  adapters/        DRIVEN — tool config emit + import, shared (yaml/toml/reader/tool→mcp)
  store/           DRIVEN — bun:sqlite BackpackStore (implements CapabilityRepository)
  application/     CORE — ports, DTOs, read-model (readable data), query + command services
  infrastructure/  wiring — DiskWorkspaceGateway + WorkspaceRegistry (opens a store per folder)
  http/            DRIVING — pure router(req)→Response (+ /api/workspaces)
  cli/             DRIVING — pure run(argv,io)→exit code
  web/             DRIVING — React + Tailwind v4 UI + createWebServer (Bun.serve)
index.ts           library demo: define → emit → import → save/load
server.ts          web+API entrypoint · cli.ts  CLI entrypoint
```

The **application layer is transport-agnostic**: the HTTP router and the CLI are both
driving adapters over the same `BackpackService` (commands) and `BackpackQueryService`
(reads). The read layer (`application/read-model.ts`) projects raw SQLite rows into readable
DTOs. `application` depends only on ports; `store`/`infrastructure`/`http` depend on
`application` — never the reverse.
