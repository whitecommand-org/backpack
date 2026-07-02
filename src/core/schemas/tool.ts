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

/**
 * A custom function tool. No CLI accepts an in-process function directly, so the
 * CLI adapters materialize every tool into a single generated stdio MCP server
 * (see `adapters/shared/tool-to-mcp.ts`). The SDK adapter binds `handler`
 * directly. `parameters` is a zod schema converted to JSON Schema at emit time.
 */
export const Tool = CapabilityBase.extend({
  /** Zod schema describing the tool's arguments. Rendered to JSON Schema on emit. */
  parameters: z.custom<z.ZodType>((v) => v instanceof z.ZodType, {
    message: "parameters must be a zod schema",
  }),
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
