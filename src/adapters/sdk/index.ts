import { z } from "zod";
import type {
  Backpack,
  Tool,
  Agent,
  Hook,
  McpServer,
  ToolResult,
} from "../../core/index.ts";

/**
 * A tool bound for in-process execution: JSON-Schema for the model, live handler
 * for the host. Shape matches what the Claude Agent SDK / Copilot SDK expect.
 */
export interface SdkTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: never) => ToolResult | Promise<ToolResult>;
}

export interface SdkAgent {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

export interface SdkHook {
  event: string;
  matcher?: string;
  command: string;
}

/** In-memory bindings for an SDK host — no files, handlers stay live. */
export interface SdkBindings {
  mcpServers: McpServer[];
  tools: SdkTool[];
  agents: SdkAgent[];
  hooks: SdkHook[];
}

/**
 * The SDK "adapter". Unlike the CLI adapters it does not emit config files;
 * instead it returns in-memory objects (tools keep their live `handler`) ready to
 * register with the Claude Agent SDK or Copilot SDK at runtime.
 */
export function toSdkBindings(backpack: Backpack): SdkBindings {
  return {
    mcpServers: backpack.mcpServers.filter((s) => s.enabled),
    tools: backpack.tools.filter((t) => t.enabled).map(toSdkTool),
    agents: backpack.agents.filter((a) => a.enabled).map(toSdkAgent),
    hooks: backpack.hooks.filter((h) => h.enabled).map(toSdkHook),
  };
}

function toSdkTool(tool: Tool): SdkTool {
  return {
    name: tool.id,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.parameters as z.ZodType),
    handler: tool.handler,
  };
}

function toSdkAgent(agent: Agent): SdkAgent {
  return {
    name: agent.id,
    description: agent.description,
    prompt: agent.systemPrompt,
    tools: agent.tools,
    model: agent.model,
  };
}

function toSdkHook(hook: Hook): SdkHook {
  const { command, args } = hook.handler;
  return {
    event: hook.event,
    matcher: hook.matcher,
    command: args && args.length ? `${command} ${args.join(" ")}` : command,
  };
}
