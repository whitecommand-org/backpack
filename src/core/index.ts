import { Backpack, type BackpackInput } from "./schemas/backpack.ts";

export * from "./schemas/index.ts";
export * from "./adapter.ts";
export * from "./importer.ts";

/**
 * Validate and normalize a backpack definition (applies defaults, checks unique
 * ids and cross-references). Throws a `ZodError` on invalid input.
 */
export function defineBackpack(input: BackpackInput): Backpack {
  return Backpack.parse(input);
}
