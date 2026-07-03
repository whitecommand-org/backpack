import type { Adapter, EmittedFile, Diagnostic } from "../../core/adapter.ts";
import type { Backpack, McpServer, Agent, Skill } from "../../core/index.ts";
import {
  resolveMcpServers,
  withFrontmatter,
  DEFAULT_TOOLS_MODULE,
  COPILOT_HOOK_EVENTS,
  supportedHookEvents,
  mapHooksForExport,
  type MappedHook,
  type YamlValue,
} from "../shared/index.ts";

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
      hookEvents: supportedHookEvents(COPILOT_HOOK_EVENTS),
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

      // Hooks → settings.json (Copilot's camelCase events + native shape).
      const hooks = backpack.hooks.filter((h) => h.enabled);
      const { mapped, diagnostics: hookDiags } = mapHooksForExport(
        hooks,
        COPILOT_HOOK_EVENTS,
        "Copilot CLI",
      );
      diagnostics.push(...hookDiags);
      for (const { hook } of mapped) {
        if (hook.matcher) {
          diagnostics.push({
            level: "warn",
            capabilityId: hook.id,
            message: `Copilot CLI hooks have no tool matcher; matcher "${hook.matcher}" was dropped.`,
          });
        }
      }
      if (mapped.length > 0) {
        files.push({
          path: ".copilot/settings.json",
          scope: "user",
          content:
            JSON.stringify({ version: 1, hooks: hooksConfig(mapped) }, null, 2) + "\n",
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

/**
 * Copilot's hooks shape: each native event maps directly to an array of entries
 * `{ type, bash, timeoutSec? }` — no matcher grouping, `bash` not `command`.
 */
function hooksConfig(mapped: MappedHook[]) {
  const config: Record<string, Array<Record<string, unknown>>> = {};
  for (const { native, hook } of mapped) {
    (config[native] ??= []).push({
      type: "command",
      bash: fullCommand(hook),
      ...(hook.handler.timeout ? { timeoutSec: hook.handler.timeout } : {}),
    });
  }
  return config;
}

function fullCommand(hook: MappedHook["hook"]): string {
  const { command, args } = hook.handler;
  return args && args.length ? `${command} ${args.join(" ")}` : command;
}
