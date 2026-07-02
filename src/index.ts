import { join } from "node:path";
import { homedir } from "node:os";
import type { Adapter, EmitResult, EmittedFile, Diagnostic } from "./core/adapter.ts";
import type { Backpack } from "./core/index.ts";
import { defineBackpack } from "./core/index.ts";
import type { Importer, SourceReader } from "./core/importer.ts";
import { mergeImported } from "./core/importer.ts";
import { DiskReader } from "./adapters/shared/index.ts";

export * from "./core/index.ts";
export * from "./adapters/index.ts";
export * from "./store/sqlite.ts";
export * from "./application/index.ts";
export * from "./infrastructure/index.ts";
export * from "./http/index.ts";
export * from "./cli/index.ts";

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

/**
 * Import existing configs into one validated `Backpack`. Merges capabilities by
 * id per kind (see `mergeImported`) and validates the result.
 */
export async function importBackpack(
  importers: Importer[],
  readers: SourceReader[],
): Promise<{ backpack: Backpack; diagnostics: Diagnostic[] }> {
  const { capabilities, diagnostics } = await mergeImported(importers, readers);
  const backpack = defineBackpack(capabilities as Parameters<typeof defineBackpack>[0]);
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
