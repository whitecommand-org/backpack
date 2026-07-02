import type { Adapter, EmittedFile, Diagnostic } from "../core/adapter.ts";
import type { Importer } from "../core/importer.ts";
import { mergeImported, IMPORTED_KINDS } from "../core/importer.ts";
import type { CapabilityRepository, WorkspaceGateway, CapabilityKind } from "./ports.ts";
import { WRITABLE_SCHEMAS, isWritableKind } from "./capability-schemas.ts";
import { detailFromRow } from "./read-model.ts";
import type { CapabilityDetail } from "./dto.ts";
import { ApplicationError } from "./errors.ts";

export interface BackpackServiceDeps {
  repository: CapabilityRepository;
  gateway: WorkspaceGateway;
  exporters: Adapter[];
  importers: Importer[];
}

export interface ImportSummary {
  imported: Record<string, number>;
  diagnostics: Diagnostic[];
}

export interface ExportSummary {
  target: string;
  files: EmittedFile[];
  written?: string[];
  diagnostics: Diagnostic[];
}

export interface TargetInfo {
  id: string;
  displayName: string;
  supports: Adapter["supports"];
}

/**
 * Write side: create/update/remove capabilities and run import/export against the
 * workspace folder. Transport-agnostic (HTTP now, CLI later). Errors are thrown as
 * `ApplicationError` for drivers to map to a status.
 */
export class BackpackService {
  constructor(private readonly deps: BackpackServiceDeps) {}

  create(kind: CapabilityKind, input: unknown): CapabilityDetail {
    const cap = this.validateWritable(kind, input);
    if (this.deps.repository.getRow(kind, cap.id)) {
      throw new ApplicationError("conflict", `${kind} "${cap.id}" already exists.`);
    }
    return this.persist(kind, cap);
  }

  update(kind: CapabilityKind, id: string, input: unknown): CapabilityDetail {
    if (!this.deps.repository.getRow(kind, id)) {
      throw new ApplicationError("not_found", `${kind} "${id}" not found.`);
    }
    // The path id is authoritative.
    const withId =
      typeof input === "object" && input !== null ? { ...input, id } : input;
    const cap = this.validateWritable(kind, withId);
    return this.persist(kind, cap);
  }

  remove(kind: CapabilityKind, id: string): void {
    if (!this.deps.repository.getRow(kind, id)) {
      throw new ApplicationError("not_found", `${kind} "${id}" not found.`);
    }
    this.deps.repository.remove(kind, id);
  }

  async importFromConfigs(opts: { targets?: string[] } = {}): Promise<ImportSummary> {
    const importers = this.selectImporters(opts.targets);
    const { capabilities, diagnostics } = await mergeImported(
      importers,
      this.deps.gateway.readers(),
    );
    const imported: Record<string, number> = {};
    for (const kind of IMPORTED_KINDS) {
      const caps = capabilities[kind] ?? [];
      for (const cap of caps) {
        this.deps.repository.upsertRow({
          kind,
          id: cap.id,
          name: cap.name,
          description: cap.description,
          data: JSON.stringify(cap),
        });
      }
      imported[kind] = caps.length;
    }
    return { imported, diagnostics };
  }

  async exportTo(opts: { target: string; write?: boolean }): Promise<ExportSummary> {
    const exporter = this.deps.exporters.find((e) => e.id === opts.target);
    if (!exporter) {
      throw new ApplicationError("bad_request", `Unknown export target "${opts.target}".`, {
        available: this.deps.exporters.map((e) => e.id),
      });
    }
    // Stub tool handlers are fine: emit never calls them.
    const { backpack } = this.deps.repository.load();
    const result = exporter.emit(backpack);
    const written = opts.write
      ? await this.deps.gateway.write(result.files)
      : undefined;
    return {
      target: exporter.id,
      files: result.files,
      ...(written ? { written } : {}),
      diagnostics: result.diagnostics,
    };
  }

  targets(): TargetInfo[] {
    return this.deps.exporters.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      supports: e.supports,
    }));
  }

  private validateWritable(
    kind: CapabilityKind,
    input: unknown,
  ): { id: string; name: string; description: string } {
    if (!isWritableKind(kind)) {
      throw new ApplicationError(
        "bad_request",
        `${kind} is read-only over the API (a tool's handler cannot be sent as data).`,
      );
    }
    const result = WRITABLE_SCHEMAS[kind].safeParse(input);
    if (!result.success) {
      throw new ApplicationError("validation", `Invalid ${kind} payload.`, result.error.issues);
    }
    return result.data as { id: string; name: string; description: string };
  }

  private persist(
    kind: CapabilityKind,
    cap: { id: string; name: string; description: string },
  ): CapabilityDetail {
    this.deps.repository.upsertRow({
      kind,
      id: cap.id,
      name: cap.name,
      description: cap.description,
      data: JSON.stringify(cap),
    });
    return detailFromRow(this.deps.repository.getRow(kind, cap.id)!);
  }

  private selectImporters(targets?: string[]): Importer[] {
    if (!targets || targets.length === 0) return this.deps.importers;
    const set = new Set(targets);
    return this.deps.importers.filter((i) => set.has(i.id));
  }
}
