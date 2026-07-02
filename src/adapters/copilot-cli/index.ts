import type { Adapter, EmittedFile, Diagnostic } from "../../core/adapter.ts";
import type {
  Backpack,
  McpServer,
  Agent,
  Skill,
  Hook,
  HookEvent,
} from "../../core/index.ts";
import {
  resolveMcpServers,
  withFrontmatter,
  DEFAULT_TOOLS_MODULE,
  type YamlValue,
} from "../shared/index.ts";

/** Hook events Copilot CLI maps natively; others become diagnostics. */
const COPILOT_HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
] as const satisfies readonly HookEvent[];

export interface CopilotOptions {
  toolsModule?: string;
}

/** GitHub Copilot CLI adapter: emits mcp-config.json, agents, settings. */
export function copilotCliAdapter(opts: CopilotOptions = {}): Adapter {
  const toolsModule = opts.toolsModule ?? DEFAULT_TOOLS_MODULE;
  return {
    id: "copilot-cli",
    displayName: "GitHub Copilot CLI",
    supports: {
      mcpServers: true,
      tools: true,
      agents: true,
      hooks: true,
      skills: false, // No skill primitive — emitted as agents.
      commands: false, // No standalone slash-command primitive — emitted as agents.
      hookEvents: COPILOT_HOOK_EVENTS,
    },
    emit(backpack: Backpack) {
      const files: EmittedFile[] = [];
      const diagnostics: Diagnostic[] = [];

      // MCP servers (+ materialized tools server).
      const { servers, toolFile } = resolveMcpServers(backpack, toolsModule);
      if (toolFile) files.push(toolFile);
      if (servers.length > 0) {
        files.push({
          path: ".copilot/mcp-config.json",
          scope: "user",
          content:
            JSON.stringify(
              { mcpServers: Object.fromEntries(servers.map(mcpEntry)) },
              null,
              2,
            ) + "\n",
        });
      }

      // Subagents.
      for (const agent of backpack.agents) {
        if (!agent.enabled) continue;
        files.push({
          path: `.github/agents/${agent.id}.md`,
          scope: "project",
          content: agentFile(agent),
        });
      }

      // Skills → agents (closest Copilot primitive).
      for (const skill of backpack.skills) {
        if (!skill.enabled) continue;
        files.push({
          path: `.github/agents/${skill.id}.md`,
          scope: "project",
          content: skillAsAgent(skill),
        });
        diagnostics.push({
          level: "warn",
          capabilityId: skill.id,
          message:
            "Copilot CLI has no skill capability; emitted as a custom agent at " +
            `.github/agents/${skill.id}.md.`,
        });
      }

      // Commands are not a Copilot primitive.
      for (const command of backpack.commands) {
        if (!command.enabled) continue;
        diagnostics.push({
          level: "warn",
          capabilityId: command.id,
          message:
            "Copilot CLI has no slash-command primitive; command was not emitted.",
        });
      }

      // Hooks → settings.json.
      const hooks = backpack.hooks.filter((h) => h.enabled);
      const supported = hooks.filter((h) => {
        const ok = (COPILOT_HOOK_EVENTS as readonly string[]).includes(h.event);
        if (!ok)
          diagnostics.push({
            level: "warn",
            capabilityId: h.id,
            message: `Copilot CLI does not support hook event "${h.event}"; skipped.`,
          });
        return ok;
      });
      if (supported.length > 0) {
        files.push({
          path: ".copilot/settings.json",
          scope: "user",
          content: JSON.stringify({ hooks: hooksConfig(supported) }, null, 2) + "\n",
        });
      }

      return { files, diagnostics };
    },
  };
}

function mcpEntry(server: McpServer): [string, Record<string, unknown>] {
  const c = server.connection;
  if (c.type === "stdio") {
    return [
      server.id,
      {
        type: "local",
        command: c.command,
        ...(c.args.length ? { args: c.args } : {}),
        ...(c.env ? { env: c.env } : {}),
        ...(server.toolFilter?.allow ? { tools: server.toolFilter.allow } : {}),
      },
    ];
  }
  return [
    server.id,
    { type: "http", url: c.url, ...(c.headers ? { headers: c.headers } : {}) },
  ];
}

function agentFile(agent: Agent): string {
  const fm: Record<string, YamlValue> = {
    name: agent.id,
    description: agent.description,
  };
  if (agent.tools) fm.tools = agent.tools;
  if (agent.model) fm.model = agent.model;
  if (agent.disableModelInvocation !== undefined)
    fm["disable-model-invocation"] = agent.disableModelInvocation;
  if (agent.userInvocable !== undefined) fm["user-invocable"] = agent.userInvocable;
  return withFrontmatter(fm, agent.systemPrompt);
}

function skillAsAgent(skill: Skill): string {
  const fm: Record<string, YamlValue> = {
    name: skill.id,
    description: skill.description,
  };
  if (skill.allowedTools) fm.tools = skill.allowedTools;
  if (skill.model) fm.model = skill.model;
  return withFrontmatter(fm, skill.body);
}

function hooksConfig(hooks: Hook[]) {
  const config: Record<string, Array<Record<string, unknown>>> = {};
  for (const hook of hooks) {
    const byEvent = (config[hook.event] ??= []);
    const matcher = hook.matcher ?? "";
    let group = byEvent.find((g) => g.matcher === matcher);
    if (!group) {
      group = { matcher, hooks: [] };
      byEvent.push(group);
    }
    (group.hooks as Array<Record<string, unknown>>).push({
      type: "command",
      command: fullCommand(hook),
      ...(hook.handler.timeout ? { timeout: hook.handler.timeout } : {}),
    });
  }
  return config;
}

function fullCommand(hook: Hook): string {
  const { command, args } = hook.handler;
  return args && args.length ? `${command} ${args.join(" ")}` : command;
}
