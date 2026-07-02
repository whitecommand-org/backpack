import { resolve, join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { Adapter } from "../core/adapter.ts";
import type { Importer } from "../core/importer.ts";
import { BackpackStore } from "../store/sqlite.ts";
import {
  BackpackService,
  BackpackQueryService,
  type TargetInfo,
} from "../application/index.ts";
import {
  claudeCodeAdapter,
  codexAdapter,
  copilotCliAdapter,
  claudeCodeImporter,
  codexImporter,
  copilotCliImporter,
} from "../adapters/index.ts";
import { DiskWorkspaceGateway } from "./workspace.ts";

export interface Workspace {
  dir: string;
  repository: BackpackStore;
  gateway: DiskWorkspaceGateway;
  query: BackpackQueryService;
  commands: BackpackService;
}

export interface WorkspaceRegistryOptions {
  exporters?: Adapter[];
  importers?: Importer[];
  /** SQLite file path relative to each workspace dir. */
  dbPath?: string;
}

export function defaultExporters(): Adapter[] {
  return [claudeCodeAdapter(), codexAdapter(), copilotCliAdapter()];
}

export function defaultImporters(): Importer[] {
  return [claudeCodeImporter(), codexImporter(), copilotCliImporter()];
}

/**
 * Opens (and caches) a `Workspace` per external folder — the driven-side wiring
 * that binds a SQLite repository, the workspace gateway, and the application
 * services. Both the HTTP layer and the future CLI use this.
 */
export class WorkspaceRegistry {
  private readonly cache = new Map<string, Workspace>();

  constructor(private readonly opts: WorkspaceRegistryOptions = {}) {}

  open(dir: string): Workspace {
    const abs = resolve(dir);
    const cached = this.cache.get(abs);
    if (cached) return cached;

    const dbFile = join(abs, this.opts.dbPath ?? ".backpack/backpack.db");
    mkdirSync(dirname(dbFile), { recursive: true });

    const repository = new BackpackStore(dbFile).init();
    const gateway = new DiskWorkspaceGateway(abs);
    const commands = new BackpackService({
      repository,
      gateway,
      exporters: this.opts.exporters ?? defaultExporters(),
      importers: this.opts.importers ?? defaultImporters(),
    });
    const workspace: Workspace = {
      dir: abs,
      repository,
      gateway,
      query: new BackpackQueryService(repository),
      commands,
    };
    this.cache.set(abs, workspace);
    return workspace;
  }

  /** Export targets and their support matrix (folder-independent). */
  targets(): TargetInfo[] {
    const exporters = this.opts.exporters ?? defaultExporters();
    return exporters.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      supports: e.supports,
    }));
  }

  close(dir: string): void {
    const abs = resolve(dir);
    this.cache.get(abs)?.repository.database.close();
    this.cache.delete(abs);
  }

  closeAll(): void {
    for (const ws of this.cache.values()) ws.repository.database.close();
    this.cache.clear();
  }
}
