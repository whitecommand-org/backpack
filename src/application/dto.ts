import type { CapabilityKind } from "./ports.ts";

/** A one-line, human-readable view of a capability (for lists). */
export interface CapabilitySummary {
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  /** A short human string, e.g. "stdio: npx pg-mcp" or "PreToolUse Bash → ./x.sh". */
  detail: string;
}

/** A summary plus kind-specific readable fields and metadata (for a single item). */
export interface CapabilityDetail extends CapabilitySummary {
  /** Readable, kind-specific key/values derived from the stored capability. */
  fields: Record<string, unknown>;
  updatedAt: number;
}

/** Counts across the whole backpack. */
export interface Overview {
  total: number;
  byKind: Record<CapabilityKind, number>;
}
