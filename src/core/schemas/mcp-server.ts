import { z } from "zod";
import { CapabilityBase } from "./capability.ts";

/** Local process the tool spawns and talks to over stdio. */
export const StdioConnection = z.object({
  type: z.literal("stdio"),
  /** Executable to run, e.g. "npx" or "bun". */
  command: z.string().min(1),
  /** Arguments passed to the command. */
  args: z.array(z.string()).default([]),
  /** Environment variables injected into the process. */
  env: z.record(z.string(), z.string()).optional(),
  /** Working directory for the process. */
  cwd: z.string().optional(),
});
export type StdioConnection = z.infer<typeof StdioConnection>;

/** Remote server reached over Streamable HTTP (also covers the older `http`). */
export const HttpConnection = z.object({
  type: z.literal("http"),
  url: z.url(),
  /** Extra request headers, e.g. Authorization. */
  headers: z.record(z.string(), z.string()).optional(),
});
export type HttpConnection = z.infer<typeof HttpConnection>;

/** Deprecated SSE transport. Kept for adapters that still accept it. */
export const SseConnection = z.object({
  type: z.literal("sse"),
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type SseConnection = z.infer<typeof SseConnection>;

export const McpConnection = z.discriminatedUnion("type", [
  StdioConnection,
  HttpConnection,
  SseConnection,
]);
export type McpConnection = z.infer<typeof McpConnection>;

/** Restrict which of a server's tools are exposed to the model. */
export const ToolFilter = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});
export type ToolFilter = z.infer<typeof ToolFilter>;

/** How aggressively a target should gate tool calls from this server. */
export const ApprovalMode = z.enum(["auto", "prompt", "approve"]);
export type ApprovalMode = z.infer<typeof ApprovalMode>;

export const McpServer = CapabilityBase.extend({
  connection: McpConnection,
  toolFilter: ToolFilter.optional(),
  timeouts: z
    .object({
      startupSec: z.number().positive().optional(),
      toolSec: z.number().positive().optional(),
    })
    .optional(),
  approval: ApprovalMode.optional(),
});
export type McpServer = z.infer<typeof McpServer>;
