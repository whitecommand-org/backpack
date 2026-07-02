import type { Diagnostic } from "./adapter.ts";
import type { McpServer } from "./schemas/mcp-server.ts";
import type { Agent } from "./schemas/agent.ts";
import type { Hook } from "./schemas/hook.ts";
import type { Skill } from "./schemas/skill.ts";
import type { Command } from "./schemas/command.ts";

/**
 * Read-only view of a config location, so importers stay filesystem-agnostic and
 * testable. Paths are relative to the reader's base (a project root or a home dir).
 */
export interface SourceReader {
  /** A label for diagnostics, e.g. "project" or "~". */
  label: string;
  /** Return the file's text, or null if it doesn't exist. */
  read(relPath: string): Promise<string | null>;
  /** List files under `dir` matching an optional glob, as relative paths. */
  list(dir: string, glob?: string): Promise<string[]>;
}

/**
 * Capabilities recovered from a config. There is no `tools`: a tool's live
 * handler never exists in a config file, and a materialized tool-server comes
 * back as an `mcpServers` entry (which importers skip when it's ours).
 */
export interface ImportedCapabilities {
  mcpServers: McpServer[];
  agents: Agent[];
  hooks: Hook[];
  skills: Skill[];
  commands: Command[];
}

export interface ImportResult {
  capabilities: Partial<ImportedCapabilities>;
  diagnostics: Diagnostic[];
}

/** Parses a target tool's config files back into portable capabilities. */
export interface Importer {
  id: string;
  displayName: string;
  import(reader: SourceReader): Promise<ImportResult>;
}

/** The importable kinds (no `tools` — handlers can't be read from configs). */
export const IMPORTED_KINDS = [
  "mcpServers",
  "agents",
  "hooks",
  "skills",
  "commands",
] as const satisfies readonly (keyof ImportedCapabilities)[];

export interface MergedImport {
  capabilities: ImportedCapabilities;
  diagnostics: Diagnostic[];
}

/**
 * Run every importer over every reader and merge capabilities by id per kind
 * (first-wins; a differing duplicate id is skipped with a warning). Shared by the
 * top-level `importBackpack` and the application's import command.
 */
export async function mergeImported(
  importers: Importer[],
  readers: SourceReader[],
): Promise<MergedImport> {
  const diagnostics: Diagnostic[] = [];
  const byKind = new Map<string, Map<string, { id: string }>>(
    IMPORTED_KINDS.map((k) => [k, new Map()]),
  );

  for (const reader of readers) {
    for (const importer of importers) {
      const result = await importer.import(reader);
      diagnostics.push(...result.diagnostics);
      for (const kind of IMPORTED_KINDS) {
        const caps = (result.capabilities[kind] ?? []) as { id: string }[];
        const map = byKind.get(kind)!;
        for (const cap of caps) {
          const existing = map.get(cap.id);
          if (existing) {
            if (JSON.stringify(existing) !== JSON.stringify(cap)) {
              diagnostics.push({
                level: "warn",
                capabilityId: cap.id,
                message: `Duplicate ${kind} id "${cap.id}" from ${importer.id}@${reader.label} ignored (kept first).`,
              });
            }
            continue;
          }
          map.set(cap.id, cap);
        }
      }
    }
  }

  const pick = <K extends keyof ImportedCapabilities>(kind: K) =>
    [...byKind.get(kind)!.values()] as ImportedCapabilities[K];

  return {
    capabilities: {
      mcpServers: pick("mcpServers"),
      agents: pick("agents"),
      hooks: pick("hooks"),
      skills: pick("skills"),
      commands: pick("commands"),
    },
    diagnostics,
  };
}
