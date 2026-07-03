import { z } from "zod";
import type { Diagnostic } from "../core/index.ts";
import type { CapabilityKind, CapabilityRepository } from "./ports.ts";
import { CAPABILITY_KINDS } from "./ports.ts";
import { WRITABLE_SCHEMAS, isWritableKind } from "./capability-schemas.ts";
import { ApplicationError } from "./errors.ts";

export const BUNDLE_FORMAT = "backpack-bundle";
export const BUNDLE_VERSION = 1;

/**
 * A portable, machine-independent snapshot of a workspace's capabilities — the raw
 * stored form grouped by kind. Tools carry metadata + JSON-Schema `parameters` but
 * no handler (unchanged from how the store persists them). Paths keep their
 * `${HOME}` tokens; expansion happens at `emit`.
 */
export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  generatedAt: number;
  capabilities: Record<CapabilityKind, unknown[]>;
}

/** Serialize the whole store into a bundle. */
export function exportBundle(repo: CapabilityRepository): Bundle {
  const capabilities = Object.fromEntries(
    CAPABILITY_KINDS.map((k) => [k, [] as unknown[]]),
  ) as Record<CapabilityKind, unknown[]>;

  for (const row of repo.allRows()) {
    try {
      capabilities[row.kind].push(JSON.parse(row.data));
    } catch {
      // A corrupt row is skipped rather than aborting the whole export.
    }
  }
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, generatedAt: Date.now(), capabilities };
}

const BundleEnvelope = z.object({
  format: z.literal(BUNDLE_FORMAT),
  version: z.number(),
  generatedAt: z.number().optional(),
  capabilities: z.record(z.string(), z.array(z.unknown())),
});

/** Minimal shape for a stored tool (no handler; parameters already JSON Schema). */
const StoredTool = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .passthrough();

/** Load a bundle into the store. Merges by id (or clears first when `replace`). */
export function importBundle(
  repo: CapabilityRepository,
  raw: unknown,
  opts: { replace?: boolean } = {},
): { imported: Record<string, number>; diagnostics: Diagnostic[] } {
  const parsed = BundleEnvelope.safeParse(raw);
  if (!parsed.success) {
    throw new ApplicationError(
      "bad_request",
      `Not a valid ${BUNDLE_FORMAT} file.`,
      parsed.error.issues,
    );
  }
  const bundle = parsed.data;

  const diagnostics: Diagnostic[] = [];
  if (bundle.version > BUNDLE_VERSION) {
    diagnostics.push({
      level: "warn",
      capabilityId: "backpack",
      message: `Bundle version ${bundle.version} is newer than supported (${BUNDLE_VERSION}); importing best-effort.`,
    });
  }

  if (opts.replace) repo.clear();

  const imported: Record<string, number> = {};
  for (const kind of CAPABILITY_KINDS) {
    const caps = bundle.capabilities[kind] ?? [];
    let count = 0;
    for (const cap of caps) {
      const validated = validateCapability(kind, cap, diagnostics);
      if (!validated) continue;
      repo.upsertRow({
        kind,
        id: validated.id,
        name: validated.name,
        description: validated.description,
        data: JSON.stringify(cap),
      });
      count++;
    }
    imported[kind] = count;
  }
  return { imported, diagnostics };
}

function validateCapability(
  kind: CapabilityKind,
  cap: unknown,
  diagnostics: Diagnostic[],
): { id: string; name: string; description: string } | null {
  const schema = isWritableKind(kind) ? WRITABLE_SCHEMAS[kind] : StoredTool;
  const result = schema.safeParse(cap);
  if (!result.success) {
    const id =
      cap && typeof cap === "object" && "id" in cap ? String((cap as { id: unknown }).id) : "?";
    diagnostics.push({
      level: "warn",
      capabilityId: id,
      message: `Skipped invalid ${kind} "${id}" in bundle: ${result.error.issues[0]?.message ?? "invalid"}.`,
    });
    return null;
  }
  return result.data as { id: string; name: string; description: string };
}
