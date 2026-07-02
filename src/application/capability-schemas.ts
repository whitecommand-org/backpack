import type { z } from "zod";
import { McpServer, Agent, Hook, Skill, Command } from "../core/index.ts";
import type { CapabilityKind } from "./ports.ts";

/**
 * Zod schemas for the capability kinds that can be created/updated over a
 * transport. `tools` is intentionally absent: a tool's live `handler` cannot
 * cross HTTP, so tools are read-only (they arrive via code or storage).
 */
export const WRITABLE_SCHEMAS = {
  mcpServers: McpServer,
  agents: Agent,
  hooks: Hook,
  skills: Skill,
  commands: Command,
} satisfies Partial<Record<CapabilityKind, z.ZodType>>;

export type WritableKind = keyof typeof WRITABLE_SCHEMAS;

export function isWritableKind(kind: CapabilityKind): kind is WritableKind {
  return kind in WRITABLE_SCHEMAS;
}
