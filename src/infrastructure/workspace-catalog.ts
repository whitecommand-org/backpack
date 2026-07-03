import { resolve, basename, join } from "node:path";
import { homedir } from "node:os";

/** A remembered workspace folder. */
export interface WorkspaceEntry {
  dir: string;
  name: string;
  addedAt: number;
}

/**
 * Persists the set of known workspace folders as JSON (default
 * `~/.backpack/workspaces.json`). Only tracks which folders exist — the folder's
 * own capabilities live in its `<dir>/.backpack/backpack.db`.
 */
export class WorkspaceCatalog {
  constructor(
    private readonly filePath: string = join(homedir(), ".backpack", "workspaces.json"),
  ) {}

  async list(): Promise<WorkspaceEntry[]> {
    const file = Bun.file(this.filePath);
    if (!(await file.exists())) return [];
    try {
      const data = (await file.json()) as unknown;
      return Array.isArray(data) ? (data as WorkspaceEntry[]) : [];
    } catch {
      return [];
    }
  }

  /** Add (or return the existing) entry for a folder. */
  async add(dir: string): Promise<WorkspaceEntry> {
    const abs = resolve(dir);
    const entries = await this.list();
    const existing = entries.find((e) => e.dir === abs);
    if (existing) return existing;
    const entry: WorkspaceEntry = { dir: abs, name: basename(abs) || abs, addedAt: Date.now() };
    await this.write([...entries, entry]);
    return entry;
  }

  async remove(dir: string): Promise<void> {
    const abs = resolve(dir);
    const entries = await this.list();
    await this.write(entries.filter((e) => e.dir !== abs));
  }

  private async write(entries: WorkspaceEntry[]): Promise<void> {
    await Bun.write(this.filePath, JSON.stringify(entries, null, 2) + "\n");
  }
}
