import { join } from "node:path";
import type { Adapter, EmitResult, EmittedFile } from "./core/adapter.ts";
import type { Backpack } from "./core/index.ts";

export * from "./core/index.ts";
export * from "./adapters/index.ts";

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
