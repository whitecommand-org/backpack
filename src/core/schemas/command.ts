import { z } from "zod";
import { CapabilityBase } from "./capability.ts";

/** A named argument a command accepts, in declaration order. */
export const CommandArgument = z.object({
  name: z.string().min(1),
  hint: z.string().optional(),
});
export type CommandArgument = z.infer<typeof CommandArgument>;

/**
 * A reusable, named slash-command prompt (replaces the old chat-message `Prompt`).
 * Emitted as `.claude/commands/*.md` and `~/.codex/prompts/*.md`. Argument
 * placeholders use `$ARGUMENTS`, `$1`, `$2`, and `$name` inside `body`.
 */
export const Command = CapabilityBase.extend({
  /** Prompt template. Supports `$ARGUMENTS` / `$1` / `$name` substitutions. */
  body: z.string().min(1),
  /** Ordered named arguments; positions map to `$1`, `$2`, ... */
  arguments: z.array(CommandArgument).optional(),
  /** Tools the command may use without prompting (Claude `allowed-tools`). */
  allowedTools: z.array(z.string()).optional(),
  /** Model override for this command. */
  model: z.string().optional(),
});

export type Command = z.infer<typeof Command>;
