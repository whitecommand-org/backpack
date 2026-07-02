import { join } from "node:path";
import type { WorkspaceGateway } from "../application/ports.ts";
import type { SourceReader, EmittedFile } from "../core/index.ts";
import { DiskReader } from "../adapters/shared/index.ts";

/**
 * Reads/writes an external folder's config files. Import reads from the folder;
 * export writes every emitted file under the folder (both project- and user-scoped
 * files stay inside the workspace so it is self-contained).
 */
export class DiskWorkspaceGateway implements WorkspaceGateway {
  constructor(readonly dir: string) {}

  readers(): SourceReader[] {
    return [new DiskReader(this.dir, "project")];
  }

  async write(files: EmittedFile[]): Promise<string[]> {
    const written: string[] = [];
    for (const file of files) {
      const path = join(this.dir, file.path);
      await Bun.write(path, file.content); // Bun.write creates parent dirs.
      written.push(path);
    }
    return written;
  }
}
