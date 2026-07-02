import { z } from "zod";
import { CapabilityBase } from "./capability.ts";

/**
 * On-demand knowledge/procedure following the Agent Skills open standard
 * (agentskills.io). Native for Claude Code (`.claude/skills/<id>/SKILL.md`).
 * Codex emits it as a prompt; Copilot has no skill slot, so its adapter falls
 * back to an agent/command and emits a diagnostic.
 */
export const Skill = CapabilityBase.extend({
  /** The instructions/reference content — the markdown body of SKILL.md. */
  body: z.string().min(1),
  invocation: z
    .object({
      /** Show in the `/` menu for manual use. Defaults to true. */
      userInvocable: z.boolean().optional(),
      /** Let the model auto-load this when relevant. Defaults to true. */
      modelInvocable: z.boolean().optional(),
    })
    .optional(),
  /** Tools usable without prompting while the skill is active. */
  allowedTools: z.array(z.string()).optional(),
  /** Model override while the skill is active. */
  model: z.string().optional(),
});

export type Skill = z.infer<typeof Skill>;
