import { join } from "node:path";
import { homedir } from "node:os";
import type { Adapter, EmitResult, EmittedFile, Diagnostic } from "./core/adapter.ts";
import type { Backpack } from "./core/index.ts";
import { defineBackpack } from "./core/index.ts";
import type { Importer, SourceReader, ImportedCapabilities } from "./core/importer.ts";
import { DiskReader } from "./adapters/shared/index.ts";

export * from "./core/index.ts";
export * from "./adapters/index.ts";
export * from "./store/sqlite.ts";

/** Run several adapters over one backpack, keyed by adapter id. */
export function emit(
  backpack: Backpack,
  adapters: Adapter[],
): Record<string, EmitResult> {
  const out: Record<string, EmitResult> = {};
  for (const adapter of adapters) out[adapter.id] = adapter.emit(backpack);
  return out;
}

/**
 * Write emitted files under `rootDir` (project-scoped) or `userDir` (user-scoped).
 * Creates parent directories as needed.
 */
export async function writeFiles(
  files: EmittedFile[],
  opts: { rootDir: string; userDir?: string },
): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const base = file.scope === "user" ? (opts.userDir ?? opts.rootDir) : opts.rootDir;
    const path = join(base, file.path);
    await Bun.write(path, file.content); // Bun.write creates parent dirs.
    written.push(path);
  }
  return written;
}

const IMPORT_KINDS = [
  "mcpServers",
  "agents",
  "hooks",
  "skills",
  "commands",
] as const satisfies readonly (keyof ImportedCapabilities)[];

/**
 * Import existing configs into one validated `Backpack`. Runs every importer over
 * every reader and merges capabilities by id per kind (first-wins; a differing
 * duplicate id is skipped with a warning).
 */
export async function importBackpack(
  importers: Importer[],
  readers: SourceReader[],
): Promise<{ backpack: Backpack; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const byKind = new Map<string, Map<string, { id: string }>>(
    IMPORT_KINDS.map((k) => [k, new Map()]),
  );

  for (const reader of readers) {
    for (const importer of importers) {
      const result = await importer.import(reader);
      diagnostics.push(...result.diagnostics);
      for (const kind of IMPORT_KINDS) {
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

  const collect = (kind: string) => [...byKind.get(kind)!.values()];
  const backpack = defineBackpack({
    mcpServers: collect("mcpServers") as Backpack["mcpServers"],
    agents: collect("agents") as Backpack["agents"],
    hooks: collect("hooks") as Backpack["hooks"],
    skills: collect("skills") as Backpack["skills"],
    commands: collect("commands") as Backpack["commands"],
  });
  return { backpack, diagnostics };
}

/** Readers for the project dir and (unless identical) the user's home dir. */
export function diskReaders(
  opts: { projectDir?: string; homeDir?: string } = {},
): SourceReader[] {
  const project = opts.projectDir ?? process.cwd();
  const home = opts.homeDir ?? homedir();
  const readers: SourceReader[] = [new DiskReader(project, "project")];
  if (home && home !== project) readers.push(new DiskReader(home, "~"));
  return readers;
}
