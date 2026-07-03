import type { CapabilityRepository, CapabilityKind } from "./ports.ts";
import type { CapabilitySummary, CapabilityDetail, Overview } from "./dto.ts";
import { summaryFromRow, detailFromRow, overviewFromRows } from "./read-model.ts";

/**
 * Read side: turns stored rows into readable DTOs. Transport-agnostic — HTTP and
 * the future CLI both call this.
 */
export class BackpackQueryService {
  constructor(private readonly repo: CapabilityRepository) {}

  overview(): Overview {
    return overviewFromRows(this.repo.allRows());
  }

  list(opts: { kind?: CapabilityKind; q?: string } = {}): CapabilitySummary[] {
    let rows = this.repo.allRows(opts.kind);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      rows = rows.filter((r) =>
        `${r.id} ${r.name} ${r.description}`.toLowerCase().includes(q),
      );
    }
    return rows.map(summaryFromRow);
  }

  get(kind: CapabilityKind, id: string): CapabilityDetail | null {
    const row = this.repo.getRow(kind, id);
    return row ? detailFromRow(row) : null;
  }

  /** The raw stored capability JSON (for editing), or null when absent. */
  raw(kind: CapabilityKind, id: string): Record<string, unknown> | null {
    const row = this.repo.getRow(kind, id);
    if (!row) return null;
    try {
      return JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
