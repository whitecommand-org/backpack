import { z } from "zod";
import { CapabilityBase } from "./capability.ts";

/**
 * What a tool handler returns. A bare string is treated as text output; the
 * structured form mirrors the MCP tool-result shape so the generated MCP server
 * can pass it through unchanged.
 */
export type ToolResult =
  | string
  | {
      content: Array<{ type: "text"; text: string }>;
      isError?: boolean;
    };

/** A plain JSON-Schema object (used when a tool is loaded from storage). */
export type JsonSchema = Record<string, unknown>;

/**
 * A tool's argument schema: a zod schema (the ergonomic authoring form) OR a
 * plain JSON-Schema object. The second form exists because a tool reloaded from
 * SQLite has its `parameters` persisted as JSON Schema — zod can't be serialized.
 * The zod branch is checked first so authored schemas keep their rich type.
 */
export const ToolParameters = z.union([
  z.custom<z.ZodType>((v) => v instanceof z.ZodType, {
    message: "parameters must be a zod schema",
  }),
  z.record(z.string(), z.unknown()),
]);
export type ToolParameters = z.ZodType | JsonSchema;

/** Normalize either parameter form to a JSON-Schema object. */
export function toJsonSchema(parameters: ToolParameters): JsonSchema {
  return parameters instanceof z.ZodType
    ? (z.toJSONSchema(parameters) as JsonSchema)
    : parameters;
}

/**
 * A custom function tool. No CLI accepts an in-process function directly, so the
 * CLI adapters materialize every tool into a single generated stdio MCP server
 * (see `adapters/shared/tool-to-mcp.ts`). The SDK adapter binds `handler`
 * directly.
 */
export const Tool = CapabilityBase.extend({
  /** Zod schema or JSON Schema describing the tool's arguments. */
  parameters: ToolParameters,
  /** The implementation. Runs inside the generated MCP server or the SDK host. */
  handler: z
    .custom<(args: never) => ToolResult | Promise<ToolResult>>(
      (v) => typeof v === "function",
      { message: "handler must be a function" },
    ),
  /**
   * Module specifier that exports this tool's `handler`, used when generating the
   * standalone MCP server file. Defaults to the entry that defines the backpack.
   */
  handlerModule: z.string().optional(),
});

export type Tool = z.infer<typeof Tool>;
