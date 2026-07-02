import { Database } from "bun:sqlite";
import type { Backpack, Tool, Diagnostic } from "../core/index.ts";
import { defineBackpack, toJsonSchema } from "../core/index.ts";

/** The six capability collections, as stored `kind` values. */
export type CapabilityKind =
  | "mcpServers"
  | "tools"
  | "agents"
  | "hooks"
  | "skills"
  | "commands";

const KINDS: CapabilityKind[] = [
  "mcpServers",
  "tools",
  "agents",
  "hooks",
  "skills",
  "commands",
];

const SCHEMA_VERSION = "1";

export interface CapabilityRow {
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
}

export interface LoadOptions {
  /** Handlers to re-attach to reloaded tools, keyed by tool id. */
  toolHandlers?: Record<string, Tool["handler"]>;
}

/**
 * Persists a `Backpack` to SQLite and reads it back. Every capability is one row
 * in a generic `capabilities` table (its JSON in `data`). Tools are stored as
 * metadata + JSON-Schema `parameters`; their live `handler` cannot be serialized,
 * so `load({ toolHandlers })` re-binds it (unbound tools get a throwing stub).
 */
export class BackpackStore {
  private readonly db: Database;

  constructor(db: string | Database = ":memory:") {
    this.db = typeof db === "string" ? new Database(db) : db;
  }

  /** Create tables if absent. Safe to call repeatedly. */
  init(): this {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS capabilities (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT,
        description TEXT,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    `);
    this.db
      .query(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)`)
      .run(SCHEMA_VERSION);
    return this;
  }

  /** Upsert every capability from the backpack. Returns non-fatal diagnostics. */
  save(backpack: Backpack): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const upsert = this.db.query(
      `INSERT INTO capabilities (kind, id, name, description, data, updated_at)
       VALUES ($kind, $id, $name, $description, $data, $updatedAt)
       ON CONFLICT(kind, id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         data = excluded.data,
         updated_at = excluded.updated_at`,
    );
    const now = Date.now();

    const run = this.db.transaction(() => {
      for (const kind of KINDS) {
        for (const cap of backpack[kind] as { id: string; name: string; description: string }[]) {
          const data = kind === "tools" ? serializeTool(cap as Tool) : JSON.stringify(cap);
          upsert.run({
            $kind: kind,
            $id: cap.id,
            $name: cap.name,
            $description: cap.description,
            $data: data,
            $updatedAt: now,
          });
        }
      }
    });
    run();
    return diagnostics;
  }

  /** Read the whole backpack back, re-binding tool handlers from `toolHandlers`. */
  load(opts: LoadOptions = {}): { backpack: Backpack; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const rows = this.db
      .query(`SELECT kind, id, data FROM capabilities`)
      .all() as { kind: CapabilityKind; id: string; data: string }[];

    const collections: Record<CapabilityKind, unknown[]> = {
      mcpServers: [],
      tools: [],
      agents: [],
      hooks: [],
      skills: [],
      commands: [],
    };

    for (const row of rows) {
      const parsed = JSON.parse(row.data);
      if (row.kind === "tools") {
        const handler = opts.toolHandlers?.[row.id];
        if (!handler) {
          diagnostics.push({
            level: "warn",
            capabilityId: row.id,
            message: `No handler provided for tool "${row.id}"; using a stub that throws if called.`,
          });
        }
        collections.tools.push({ ...parsed, handler: handler ?? stubHandler(row.id) });
      } else {
        collections[row.kind]?.push(parsed);
      }
    }

    const backpack = defineBackpack({
      mcpServers: collections.mcpServers as Backpack["mcpServers"],
      tools: collections.tools as Backpack["tools"],
      agents: collections.agents as Backpack["agents"],
      hooks: collections.hooks as Backpack["hooks"],
      skills: collections.skills as Backpack["skills"],
      commands: collections.commands as Backpack["commands"],
    });
    return { backpack, diagnostics };
  }

  /** List stored capability metadata, optionally filtered by kind. */
  list(kind?: CapabilityKind): CapabilityRow[] {
    const sql = kind
      ? `SELECT kind, id, name, description FROM capabilities WHERE kind = ? ORDER BY kind, id`
      : `SELECT kind, id, name, description FROM capabilities ORDER BY kind, id`;
    const query = this.db.query(sql);
    return (kind ? query.all(kind) : query.all()) as CapabilityRow[];
  }

  remove(kind: CapabilityKind, id: string): void {
    this.db.query(`DELETE FROM capabilities WHERE kind = ? AND id = ?`).run(kind, id);
  }

  clear(): void {
    this.db.run(`DELETE FROM capabilities`);
  }

  /** The underlying database, e.g. to close it. */
  get database(): Database {
    return this.db;
  }
}

function serializeTool(tool: Tool): string {
  // JSON.stringify drops the `handler` function automatically.
  return JSON.stringify({ ...tool, parameters: toJsonSchema(tool.parameters) });
}

function stubHandler(id: string): Tool["handler"] {
  return () => {
    throw new Error(`Tool "${id}" was loaded from storage without a handler.`);
  };
}
