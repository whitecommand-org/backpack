export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, string>;
  handler: (parameters: this["parameters"]) => Promise<void> | void | string;
}

export interface Prompt {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StdIoMCP {
  type: "stdio";
  command: string | string[];
}

export interface HttpMCP {
  type: "http";
  url: string;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  environmentVariables: Record<string, string>;
  connection: StdIoMCP | HttpMCP;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
}

/**
 * See
 * Claude Code: https://code.claude.com/docs/en/agent-sdk/hooks
 * GitHub Copilot SDK: https://github.com/github/copilot-sdk/blob/main/docs/features/hooks.md
 * Codex: https://developers.openai.com/codex/hooks
 */
export interface Hook {
  id: string;
  name: string;
  description: string;
  tools: string[];
  event: string;
  handler: (eventData: unknown) => unknown;
}

/**
 * See
 * Claude Code: https://code.claude.com/docs/en/sub-agents
 * GitHub Copilot SDK: https://github.com/github/copilot-sdk/blob/main/docs/features/custom-agents.md
 * Codex: https://developers.openai.com/codex/subagents
 */
export interface SubAgent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  model?: string;
  skills?: string[];
}
