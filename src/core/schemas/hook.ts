import { z } from "zod";
import { CapabilityBase } from "./capability.ts";
import { HookEvent } from "./events.ts";

/**
 * A shell-command hook handler — the only form every target can express. Claude
 * Code also supports http/mcp_tool/prompt/agent handlers; those are out of scope
 * for the portable core (an adapter may extend this).
 */
export const CommandHandler = z.object({
  type: z.literal("command").default("command"),
  /** Shell command to execute. Receives event JSON on stdin. */
  command: z.string().min(1),
  /** Arguments appended to the command. */
  args: z.array(z.string()).optional(),
  /** Windows-specific override (used by Codex `commandWindows`). */
  commandWindows: z.string().optional(),
  /** Timeout in seconds. */
  timeout: z.number().positive().optional(),
});
export type CommandHandler = z.infer<typeof CommandHandler>;

export const Hook = CapabilityBase.extend({
  /** Normalized lifecycle event. Adapters map to the target's native name. */
  event: HookEvent,
  /** Tool-name pattern for tool events (e.g. "Bash", "Edit|Write"). */
  matcher: z.string().optional(),
  handler: CommandHandler,
});

export type Hook = z.infer<typeof Hook>;
