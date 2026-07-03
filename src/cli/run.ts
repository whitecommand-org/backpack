import { parseArgs } from "node:util";
import { WorkspaceRegistry, WorkspaceCatalog } from "../infrastructure/index.ts";
import {
  ApplicationError,
  isCapabilityKind,
  exportBundle,
  importBundle,
  type CapabilityKind,
} from "../application/index.ts";
import {
  realIo,
  formatOverview,
  formatList,
  formatDetail,
  formatImport,
  formatExport,
  formatTargets,
  type CliIO,
} from "./output.ts";

export interface RunOptions {
  io?: CliIO;
  registry?: WorkspaceRegistry;
  catalog?: WorkspaceCatalog;
}

const USAGE = `backpack — manage AI coding-agent capabilities in a folder

Usage: backpack <command> [options]

Commands:
  overview                     Capability counts for the folder
  list [kind] [-q term]        List capabilities (readable summaries)
  get <kind> <id>              Show one capability in detail
  add <kind>                   Create a capability (JSON via --data/--file/stdin)
  set <kind> <id>              Update a capability (JSON via --data/--file/stdin)
  rm <kind> <id>               Delete a capability
  import [--targets a,b]       Import the folder's existing tool configs
  export <target> [--write]    Emit a target's config (optionally write to the folder)
  bundle export [--out f]      Save the whole backpack to a portable JSON file (or stdout)
  bundle import <f> [--replace] Load a bundle into the folder (merge, or replace)
  targets                      List export targets and their supported kinds
  serve [--port N]             Start the HTTP API
  help                         Show this help

Global options:
  --dir <path>   Folder to operate on (default: current directory)
  --json         Machine-readable JSON output
  -h, --help     Show help
  --version      Show version

Kinds: mcpServers, tools, agents, hooks, skills, commands (tools are read-only)`;

/**
 * Pure CLI entry: parses argv, runs a command, returns an exit code. I/O and the
 * workspace registry are injectable so it can be tested without spawning a process.
 */
export async function run(argv: string[], opts: RunOptions = {}): Promise<number> {
  const io = opts.io ?? realIo;
  const registry = opts.registry ?? new WorkspaceRegistry();
  const catalog = opts.catalog ?? new WorkspaceCatalog();

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        dir: { type: "string" },
        json: { type: "boolean" },
        data: { type: "string" },
        file: { type: "string" },
        targets: { type: "string" },
        write: { type: "boolean" },
        out: { type: "string" },
        replace: { type: "boolean" },
        port: { type: "string" },
        q: { type: "string", short: "q" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean" },
      },
    });
  } catch (err) {
    io.err(err instanceof Error ? err.message : String(err));
    io.err(USAGE);
    return 1;
  }

  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (values.version) {
    io.out(await version());
    return 0;
  }
  if (values.help || !command || command === "help") {
    io.out(USAGE);
    return command || values.help ? 0 : 1;
  }

  try {
    return await dispatch(command, rest, values, { io, registry, catalog });
  } catch (err) {
    if (err instanceof ApplicationError) {
      io.err(`error (${err.code}): ${err.message}`);
      if (err.details !== undefined) io.err(JSON.stringify(err.details, null, 2));
      return 1;
    }
    io.err(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

type Values = Record<string, unknown>;

async function dispatch(
  command: string,
  args: string[],
  values: Values,
  ctx: { io: CliIO; registry: WorkspaceRegistry; catalog: WorkspaceCatalog },
): Promise<number> {
  const { io, registry, catalog } = ctx;
  const json = values.json === true;
  const dir = typeof values.dir === "string" ? values.dir : process.cwd();
  const ws = () => registry.open(dir);

  switch (command) {
    case "serve": {
      const port = values.port ? Number(values.port) : undefined;
      // Dynamic import so the HTML/React bundle graph only loads for `serve`.
      const { createWebServer } = await import("../web/server.ts");
      const server = createWebServer({ port, registry, catalog });
      io.out(`backpack UI + API on http://localhost:${server.port}`);
      return new Promise<number>(() => {}); // keep the process alive
    }

    case "targets": {
      const targets = registry.targets();
      io.out(json ? stringify(targets) : formatTargets(targets));
      return 0;
    }

    case "overview": {
      const overview = ws().query.overview();
      io.out(json ? stringify(overview) : formatOverview(overview));
      return 0;
    }

    case "list": {
      const kind = args[0] ? requireKind(args[0]) : undefined;
      const q = typeof values.q === "string" ? values.q : undefined;
      const items = ws().query.list({ kind, q });
      io.out(json ? stringify(items) : formatList(items));
      return 0;
    }

    case "get": {
      const kind = requireKind(need(args[0], "kind"));
      const id = need(args[1], "id");
      const detail = ws().query.get(kind, id);
      if (!detail) {
        io.err(`error (not_found): ${kind} "${id}" not found.`);
        return 1;
      }
      io.out(json ? stringify(detail) : formatDetail(detail));
      return 0;
    }

    case "add": {
      const kind = requireKind(need(args[0], "kind"));
      const input = await readJsonInput(values, io);
      const detail = ws().commands.create(kind, input);
      await catalog.add(dir);
      io.out(json ? stringify(detail) : formatDetail(detail));
      return 0;
    }

    case "set": {
      const kind = requireKind(need(args[0], "kind"));
      const id = need(args[1], "id");
      const input = await readJsonInput(values, io);
      const detail = ws().commands.update(kind, id, input);
      await catalog.add(dir);
      io.out(json ? stringify(detail) : formatDetail(detail));
      return 0;
    }

    case "rm": {
      const kind = requireKind(need(args[0], "kind"));
      const id = need(args[1], "id");
      ws().commands.remove(kind, id);
      io.out(json ? stringify({ removed: { kind, id } }) : `removed ${kind}/${id}`);
      return 0;
    }

    case "import": {
      const targets =
        typeof values.targets === "string"
          ? values.targets.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined;
      const result = await ws().commands.importFromConfigs({ targets });
      // Commands that populate a folder (add/set/import) register it as a known
      // workspace so it surfaces in the web UI.
      await catalog.add(dir);
      io.out(json ? stringify(result) : formatImport(result));
      return 0;
    }

    case "export": {
      const target = need(args[0], "target");
      const result = await ws().commands.exportTo({ target, write: values.write === true });
      io.out(json ? stringify(result) : formatExport(result));
      return 0;
    }

    case "bundle": {
      const sub = need(args[0], "subcommand (export|import)");
      if (sub === "export") {
        const bundle = exportBundle(ws().repository);
        const text = stringify(bundle);
        const total = Object.values(bundle.capabilities).reduce((n, c) => n + c.length, 0);
        if (typeof values.out === "string") {
          await Bun.write(values.out, text + "\n");
          io.out(`wrote bundle → ${values.out} (${total} capabilit${total === 1 ? "y" : "ies"})`);
        } else {
          io.out(text);
        }
        return 0;
      }
      if (sub === "import") {
        const path = typeof args[1] === "string" ? args[1] : undefined;
        const raw =
          path !== undefined
            ? await Bun.file(path).text()
            : typeof values.file === "string"
              ? await Bun.file(values.file).text()
              : await io.readStdin();
        if (!raw.trim()) {
          throw new ApplicationError("bad_request", "No bundle provided (pass a file path, --file, or stdin).");
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new ApplicationError("bad_request", "Bundle is not valid JSON.");
        }
        const result = importBundle(ws().repository, parsed, { replace: values.replace === true });
        await catalog.add(dir);
        io.out(json ? stringify(result) : formatImport(result));
        return 0;
      }
      throw new ApplicationError("bad_request", `Unknown bundle subcommand "${sub}" (use export|import).`);
    }

    default:
      io.err(`Unknown command: ${command}`);
      io.err(USAGE);
      return 1;
  }
}

function requireKind(value: string): CapabilityKind {
  if (!isCapabilityKind(value)) {
    throw new ApplicationError("bad_request", `Unknown capability kind "${value}".`);
  }
  return value;
}

function need(value: string | undefined, name: string): string {
  if (!value) throw new ApplicationError("bad_request", `Missing required argument: ${name}.`);
  return value;
}

async function readJsonInput(values: Values, io: CliIO): Promise<unknown> {
  let raw: string;
  if (typeof values.data === "string") raw = values.data;
  else if (typeof values.file === "string") raw = await Bun.file(values.file).text();
  else raw = await io.readStdin();

  if (!raw.trim()) {
    throw new ApplicationError(
      "bad_request",
      "No capability JSON provided (use --data, --file, or pipe stdin).",
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApplicationError("bad_request", "Input is not valid JSON.");
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function version(): Promise<string> {
  // Compiled binaries inject this via `bun build --define`; a bare `bun cli.ts`
  // run has no such value and falls back to reading package.json.
  if (process.env.BACKPACK_VERSION) return process.env.BACKPACK_VERSION;
  try {
    const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
    return String(pkg.version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
}
