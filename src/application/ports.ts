import type {
  Backpack,
  Tool,
  Diagnostic,
  EmittedFile,
  SourceReader,
} from "../core/index.ts";

/** The six capability collections, as stored `kind` values. */
export type CapabilityKind =
  | "mcpServers"
  | "tools"
  | "agents"
  | "hooks"
  | "skills"
  | "commands";

export const CAPABILITY_KINDS: CapabilityKind[] = [
  "mcpServers",
  "tools",
  "agents",
  "hooks",
  "skills",
  "commands",
];

export function isCapabilityKind(value: string): value is CapabilityKind {
  return (CAPABILITY_KINDS as string[]).includes(value);
}

export interface LoadOptions {
  /** Handlers to re-attach to reloaded tools, keyed by tool id. */
  toolHandlers?: Record<string, Tool["handler"]>;
}

/** One persisted capability: metadata columns plus its JSON `data`. */
export interface CapabilityRow {
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  data: string;
  updatedAt: number;
}

/**
 * Driven port: per-folder persistence of capabilities. Queries read `data` JSON
 * directly (no tool-handler rebinding); `load` is only needed for export.
 */
export interface CapabilityRepository {
  init(): void;
  allRows(kind?: CapabilityKind): CapabilityRow[];
  getRow(kind: CapabilityKind, id: string): CapabilityRow | null;
  upsertRow(row: Omit<CapabilityRow, "updatedAt">): void;
  remove(kind: CapabilityKind, id: string): void;
  save(backpack: Backpack): Diagnostic[];
  load(opts?: LoadOptions): { backpack: Backpack; diagnostics: Diagnostic[] };
}

/** Driven port: the external folder's config files (read for import, write for export). */
export interface WorkspaceGateway {
  dir: string;
  readers(): SourceReader[];
  write(files: EmittedFile[]): Promise<string[]>;
}
