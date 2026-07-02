import { z } from "zod";
import { CapabilityBase } from "./capability.ts";

/**
 * A specialized subagent with its own system prompt, tool access and (optionally)
 * model. Emitted as `.claude/agents/*.md`, Copilot `.github/agents/*.md`, and a
 * Codex `[agents.*]` entry.
 */
export const Agent = CapabilityBase.extend({
  /** System prompt / instructions. Becomes the markdown body for CLI adapters. */
  systemPrompt: z.string().min(1),
  /** Tool allowlist. Omit to inherit all tools; `[]` to disable all. */
  tools: z.array(z.string()).optional(),
  /** Model override, e.g. "opus", "sonnet", or a full model id. */
  model: z.string().optional(),
  /** Skill ids to preload into the subagent (Claude Code only). */
  skills: z.array(z.string()).optional(),
  /** MCP server ids this agent may use (Copilot embeds these in frontmatter). */
  mcpServers: z.array(z.string()).optional(),
  /** Prevent the model from auto-delegating to this agent. */
  disableModelInvocation: z.boolean().optional(),
  /** Allow the user to invoke this agent manually. Defaults to true. */
  userInvocable: z.boolean().optional(),
});

export type Agent = z.infer<typeof Agent>;
