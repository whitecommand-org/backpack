# backpack

> A portable backpack of AI coding-agent capabilities — declare MCP servers, tools,
> subagents, hooks, skills and slash-commands **once**, then emit them to Claude Code,
> Codex CLI, and GitHub Copilot CLI (or adopt what you already have).

Point it at a project folder and it reads or writes each tool's native config. Move a whole
setup between tools, or between machines, without hand-editing `.mcp.json`, `config.toml`, or
`~/.claude.json`.

**Contents** — [Install](#install) · [Quick start](#quick-start) · [CLI](#cli) ·
[Concepts](#concepts) · [Library](#library-programmatic-use) · [HTTP API](#http-api) ·
[Web UI](#web-ui) · [Develop](#develop) · [Releasing](#releasing)

---

## Install

### Standalone binary (recommended — no Bun required)

One-line installer (auto-detects OS/arch, verifies the checksum, installs to `/usr/local/bin`):

```bash
curl -fsSL https://raw.githubusercontent.com/whitecommand-org/backpack/main/install.sh | sh
```

- Pin a version: `BACKPACK_VERSION=v0.1.1 …`
- Install without sudo: `BACKPACK_INSTALL_DIR=$HOME/.local/bin …`

Or download a binary manually from the
[latest release](https://github.com/whitecommand-org/backpack/releases/latest) and:

```bash
chmod +x backpack-darwin-arm64 && mv backpack-darwin-arm64 /usr/local/bin/backpack
xattr -d com.apple.quarantine /usr/local/bin/backpack   # macOS only (unsigned binary)
```

### With Bun

Requires [Bun](https://bun.com) (the package uses Bun-native APIs):

```bash
bunx @whitecommand-org/backpack overview     # run without installing
bun add -g @whitecommand-org/backpack        # then just: backpack …
```

Verify: `backpack --version`.

---

## Quick start

```bash
# 1. Adopt the configs already in a project (and your ~/.claude.json, etc.)
backpack import --dir ./my-project

# 2. See what was captured
backpack overview --dir ./my-project

# 3. Mirror it to a different tool
backpack export codex --write --dir ./my-project      # writes .codex/config.toml

# 4. Open the visual console
backpack serve                                        # http://localhost:4000
```

Add a capability directly (JSON via `--data`, `--file`, or stdin):

```bash
echo '{"id":"reviewer","name":"Reviewer","description":"Reviews diffs",
       "systemPrompt":"Be terse.","model":"sonnet"}' | backpack add agents --dir ./my-project
```

---

## CLI

`backpack <command>` operates on one folder (`--dir`, default the current directory). It talks
to that folder's store directly — no server needed — and shares the exact logic and readable
output as the HTTP API and Web UI.

| Command | Does |
|---|---|
| `overview` | Capability counts for the folder |
| `list [kind] [-q term]` | Readable summaries (add `--json` for scripting) |
| `get <kind> <id>` | Show one capability in detail |
| `add <kind>` / `set <kind> <id>` | Create / update (JSON via `--data`/`--file`/stdin) |
| `rm <kind> <id>` | Delete a capability |
| `import [--targets a,b]` | Adopt the folder's existing tool configs |
| `export <target> [--write]` | Emit a target's config (optionally write it) |
| `bundle export [--out f]` / `bundle import <f> [--replace]` | Move the whole backpack as one JSON file |
| `targets` | List export targets and their supported kinds |
| `serve [--port N]` | Start the Web UI + HTTP API |

Tools are read-only over the CLI/HTTP (their live `handler` can't be sent as data). Exit code
is non-zero on error.

---

## Concepts

### Capabilities

| Capability | What it is |
|---|---|
| `mcpServers` | MCP servers (stdio / http). |
| `tools` | Custom function tools. Materialized into a generated stdio MCP server so any CLI can use them — no hand-written MCP config. |
| `agents` | Subagents with their own system prompt, tools and model. |
| `hooks` | Shell-command lifecycle hooks on a normalized event set. |
| `skills` | On-demand knowledge/procedures ([Agent Skills](https://agentskills.io) standard). |
| `commands` | Reusable named slash-command prompts with arguments. |

### What each target emits

- **Claude Code** → `.mcp.json`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`,
  `.claude/commands/*.md`, `.claude/settings.json` (hooks).
- **Codex CLI** → `.codex/config.toml` (`[mcp_servers.*]`, `[agents.*]`, `[[hooks.*]]`),
  `.codex/prompts/*.md`.
- **Copilot CLI** → `.copilot/mcp-config.json`, `.github/agents/*.md`, `.copilot/settings.json`.
- **SDK** → in-memory bindings (`toSdkBindings`), handlers stay live.

Emitting is honest: it returns **diagnostics** (never throws) when a target can't express
something — Copilot has no skills, Codex agents have no inline system prompt, etc. Importing is
the inverse; it can't recover a tool's live `handler`, so **import never yields `tools`**.
Together this enables migration: **import from Claude Code → export to Copilot**.

### Hook events

Events are normalized, then mapped to each destination's native name on export: Claude/Codex
use PascalCase (`PreToolUse`), Copilot uses camelCase with renames (`Stop`→`agentStop`,
`UserPromptSubmit`→`userPromptSubmitted`). An event with no equivalent is **skipped with a
diagnostic** (Codex has no `SessionEnd`, Copilot no `PostCompact`).

### Portable across machines

- **Paths**: absolute paths under your home dir are stored as `${HOME}/…` on import and
  expanded to the *local* home on export — so a backpack works on another machine.
- **Bundle**: `backpack bundle export --out backpack.json` writes the whole backpack to one
  file; `bundle import` loads it into any folder (`--replace` to overwrite). No copying SQLite
  files or matching folder paths.

```bash
backpack bundle export --dir ~/projA --out backpack.json   # machine A
backpack bundle import backpack.json --dir ~/work/projA     # machine B — paths expand locally
```

---

## Library (programmatic use)

`backpack` is also a Bun/TypeScript library.

```ts
import { z } from "zod";
import {
  defineBackpack, emit, writeFiles,
  claudeCodeAdapter, codexAdapter, copilotCliAdapter, toSdkBindings,
  type Tool,
} from "@whitecommand-org/backpack";

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

const results = emit(backpack, [claudeCodeAdapter(), codexAdapter(), copilotCliAdapter()]);
await writeFiles(results["claude-code"].files, { rootDir: process.cwd() });

const sdk = toSdkBindings(backpack); // runtime path — handlers stay live
```

The core is a single set of **zod schemas** (`src/core/schemas`); types are `z.infer`red.
`defineBackpack()` validates input, applies defaults, and checks ids and cross-references.

**Import** (uses Bun's built-in `Bun.TOML.parse` / `Bun.YAML.parse` — no extra deps):

```ts
import { importBackpack, diskReaders,
         claudeCodeImporter, codexImporter, copilotCliImporter } from "@whitecommand-org/backpack";

const { backpack, diagnostics } = await importBackpack(
  [claudeCodeImporter(), codexImporter(), copilotCliImporter()],
  diskReaders(), // scans the project dir AND the user's home dir
);
```

**SQLite storage** — a durable, per-folder backpack:

```ts
import { BackpackStore } from "@whitecommand-org/backpack";

const store = new BackpackStore("backpack.db").init();
store.save(backpack);
const { backpack: reloaded } = store.load({ toolHandlers: { "word-count": handler } });
```

Every capability is one row in a generic `capabilities` table. Tools persist as metadata +
JSON-Schema `parameters` (the `handler` can't be serialized), so `load` takes a `toolHandlers`
map to re-attach them. Typical flow: **import → save → load → emit**.

---

## HTTP API

`backpack serve` starts a **multi-workspace** API (no auth): each request names the folder it
operates on via a `dir` body field, `?dir=`, or an `X-Backpack-Dir` header. The store lives at
`<dir>/.backpack/backpack.db`; the API is mounted under `/api`.

| Method + path | Action |
|---|---|
| `GET /api/health` · `GET /api/targets` | liveness · exporter support matrix |
| `GET /api/overview` | capability counts by kind |
| `GET /api/capabilities?kind=&q=` | readable summaries |
| `GET /api/capabilities/:kind/:id` | readable detail |
| `POST /api/capabilities/:kind` · `PUT …/:id` · `DELETE …/:id` | create · update · delete |
| `POST /api/import` `{ targets? }` | import the folder's configs |
| `POST /api/export` `{ target, write? }` | emit a target's config (optionally write it) |

```bash
curl -X POST localhost:4000/api/export -H 'X-Backpack-Dir: /path/to/project' \
  -H 'content-type: application/json' -d '{"target":"codex","write":true}'
```

Errors are `{ error: { code, message, details? } }` (400/404/409/422).

## Web UI

`backpack serve` also serves a monochrome web console (React + Tailwind v4 via `Bun.serve`) at
`/`. Manage **workspaces** (folders), browse **capabilities** with filter/search and a detail
drawer, create/edit via **guided per-kind forms**, and run **import / export** with
terminal-styled output.

---

## Develop

Requires [Bun](https://bun.com). From a clone:

```bash
bun install
bun test              # run the suite
bunx tsc --noEmit     # typecheck
bun cli.ts overview --dir .   # run the CLI from source
bun server.ts         # run the Web UI + API from source
bun run index.ts      # library demo: define → emit → import → save/load
```

Build the standalone binary locally: `bun run build:cli` → `dist/backpack`.

### Architecture (hexagonal)

```
src/
  core/            DOMAIN — zod schemas, defineBackpack, Adapter/Importer contracts
  adapters/        DRIVEN — tool config emit + import, shared (yaml/toml/reader/tool→mcp)
  store/           DRIVEN — bun:sqlite BackpackStore (implements CapabilityRepository)
  application/     CORE  — ports, DTOs, read-model, query + command services
  infrastructure/  wiring — DiskWorkspaceGateway + WorkspaceRegistry (a store per folder)
  http/  cli/  web/  DRIVING adapters over the same application services
```

The **application layer is transport-agnostic**: CLI, HTTP, and Web UI are all driving adapters
over the same `BackpackService` (commands) and `BackpackQueryService` (reads). `application`
depends only on ports; `store`/`infrastructure`/`http`/`cli`/`web` depend on `application` —
never the reverse.

---

## Releasing

Pushing a `v*.*.*` tag runs two GitHub Actions workflows:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

- **release-binaries** — cross-compiles the CLI for linux/darwin/windows (x64 + arm64) and
  attaches the binaries + `.sha256` checksums to the GitHub Release.
- **npm-publish** — sets the version from the tag and publishes `@whitecommand-org/backpack`.

One-time setup: add an `NPM_TOKEN` repo secret (npm *Automation* token with publish rights to
the `@whitecommand-org` scope). `GITHUB_TOKEN` is provided automatically for the release upload.
