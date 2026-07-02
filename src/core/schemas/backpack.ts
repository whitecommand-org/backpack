import { z } from "zod";
import { McpServer } from "./mcp-server.ts";
import { Tool } from "./tool.ts";
import { Agent } from "./agent.ts";
import { Hook } from "./hook.ts";
import { Skill } from "./skill.ts";
import { Command } from "./command.ts";

/** Reject duplicate ids within a single capability collection. */
function uniqueIds<T extends { id: string }>(kind: string) {
  return (items: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate ${kind} id: ${item.id}`,
        });
      }
      seen.add(item.id);
    }
  };
}

/**
 * The portable "backpack": one declarative source of truth holding every
 * capability. Adapters consume this and emit tool-native config files.
 */
export const Backpack = z
  .object({
    mcpServers: z.array(McpServer).default([]).superRefine(uniqueIds("mcpServer")),
    tools: z.array(Tool).default([]).superRefine(uniqueIds("tool")),
    agents: z.array(Agent).default([]).superRefine(uniqueIds("agent")),
    hooks: z.array(Hook).default([]).superRefine(uniqueIds("hook")),
    skills: z.array(Skill).default([]).superRefine(uniqueIds("skill")),
    commands: z.array(Command).default([]).superRefine(uniqueIds("command")),
  })
  .superRefine((bp, ctx) => {
    const skillIds = new Set(bp.skills.map((s) => s.id));
    const serverIds = new Set(bp.mcpServers.map((s) => s.id));
    for (const agent of bp.agents) {
      for (const skill of agent.skills ?? []) {
        if (!skillIds.has(skill)) {
          ctx.addIssue({
            code: "custom",
            message: `agent "${agent.id}" references unknown skill "${skill}"`,
          });
        }
      }
      for (const server of agent.mcpServers ?? []) {
        if (!serverIds.has(server)) {
          ctx.addIssue({
            code: "custom",
            message: `agent "${agent.id}" references unknown mcpServer "${server}"`,
          });
        }
      }
    }
  });

/** Input accepted by `defineBackpack` (defaults applied on parse). */
export type BackpackInput = z.input<typeof Backpack>;
/** Fully-parsed backpack with defaults filled in. */
export type Backpack = z.infer<typeof Backpack>;
