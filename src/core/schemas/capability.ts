import { z } from "zod";

/**
 * A slug-like identifier used to name a capability across tools. Becomes a file
 * name, a config key, or a `/command` depending on the adapter, so we keep it to
 * lowercase letters, numbers and dashes.
 */
export const CapabilityId = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "id must be kebab-case (lowercase letters, numbers, dashes)",
  });

/**
 * Fields shared by every capability in the backpack. Each concrete capability
 * schema extends this via `CapabilityBase.extend({ ... })`.
 */
export const CapabilityBase = z.object({
  /** Stable kebab-case identifier, unique within its capability collection. */
  id: CapabilityId,
  /** Human-facing display name. Defaults to `id` when adapters need one. */
  name: z.string().min(1),
  /** One-line description. Tools use this to decide when to surface/auto-invoke. */
  description: z.string().min(1),
  /** When false, adapters skip emitting this capability. Defaults to true. */
  enabled: z.boolean().default(true),
  /** Free-form annotations passed through to adapters that support them. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CapabilityBase = z.infer<typeof CapabilityBase>;
