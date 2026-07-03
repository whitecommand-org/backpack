import type { Adapter, EmittedFile, Diagnostic } from "../../core/adapter.ts";
import type {
  Backpack,
  McpServer,
  Agent,
  Skill,
  Command,
} from "../../core/index.ts";
import {
  resolveMcpServers,
  withFrontmatter,
  DEFAULT_TOOLS_MODULE,
  CLAUDE_HOOK_EVENTS,
  supportedHookEvents,
  mapHooksForExport,
  type MappedHook,
  type YamlValue,
} from "../shared/index.ts";

export interface ClaudeCodeOptions {
  /** Module the generated tools server imports handlers from. */
  toolsModule?: string;
}

/** Claude Code adapter: emits `.mcp.json`, agents, skills, commands, settings. */
export function claudeCodeAdapter(opts: ClaudeCodeOptions = {}): Adapter {
  const toolsModule = opts.toolsModule ?? DEFAULT_TOOLS_MODULE;
  return {
    id: "claude-code",
    displayName: "Claude Code",
    supports: {
      mcpServers: true,
      tools: true,
      agents: true,
      hooks: true,
      skills: true,
      commands: true,
      hookEvents: supportedHookEvents(CLAUDE_HOOK_EVENTS),
    },
    emit(backpack: Backpack) {
      const files: EmittedFile[] = [];
      const diagnostics: Diagnostic[] = [];

      // MCP servers (+ materialized tools server).
      const { servers, toolFile } = resolveMcpServers(backpack, toolsModule);
      if (toolFile) files.push(toolFile);
      if (servers.length > 0) {
        files.push({
          path: ".mcp.json",
          scope: "project",
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
          path: `.claude/agents/${agent.id}.md`,
          scope: "project",
          content: agentFile(agent),
        });
      }

      // Skills.
      for (const skill of backpack.skills) {
        if (!skill.enabled) continue;
        files.push({
          path: `.claude/skills/${skill.id}/SKILL.md`,
          scope: "project",
          content: skillFile(skill),
        });
      }

      // Commands.
      for (const command of backpack.commands) {
        if (!command.enabled) continue;
        files.push({
          path: `.claude/commands/${command.id}.md`,
          scope: "project",
          content: commandFile(command),
        });
      }

      // Hooks → settings.json (events mapped to Claude's names; unmapped skipped).
      const hooks = backpack.hooks.filter((h) => h.enabled);
      const { mapped, diagnostics: hookDiags } = mapHooksForExport(
        hooks,
        CLAUDE_HOOK_EVENTS,
        "Claude Code",
      );
      diagnostics.push(...hookDiags);
      if (mapped.length > 0) {
        files.push({
          path: ".claude/settings.json",
          scope: "project",
          content: JSON.stringify({ hooks: hooksConfig(mapped) }, null, 2) + "\n",
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
        command: c.command,
        ...(c.args.length ? { args: c.args } : {}),
        ...(c.env ? { env: c.env } : {}),
        ...(c.cwd ? { cwd: c.cwd } : {}),
      },
    ];
  }
  return [
    server.id,
    {
      type: c.type, // "http" | "sse"
      url: c.url,
      ...(c.headers ? { headers: c.headers } : {}),
    },
  ];
}

function agentFile(agent: Agent): string {
  const fm: Record<string, YamlValue> = {
    name: agent.id,
    description: agent.description,
  };
  if (agent.tools) fm.tools = agent.tools.join(", ");
  if (agent.model) fm.model = agent.model;
  return withFrontmatter(fm, agent.systemPrompt);
}

function skillFile(skill: Skill): string {
  const fm: Record<string, YamlValue> = {
    name: skill.id,
    description: skill.description,
  };
  if (skill.invocation?.modelInvocable === false)
    fm["disable-model-invocation"] = true;
  if (skill.invocation?.userInvocable === false) fm["user-invocable"] = false;
  if (skill.allowedTools) fm["allowed-tools"] = skill.allowedTools.join(" ");
  if (skill.model) fm.model = skill.model;
  return withFrontmatter(fm, skill.body);
}

function commandFile(command: Command): string {
  const fm: Record<string, YamlValue> = { description: command.description };
  if (command.arguments?.length) {
    fm["argument-hint"] = command.arguments
      .map((a) => (a.hint ? `[${a.name}: ${a.hint}]` : `[${a.name}]`))
      .join(" ");
  }
  if (command.allowedTools) fm["allowed-tools"] = command.allowedTools.join(", ");
  if (command.model) fm.model = command.model;
  return withFrontmatter(fm, command.body);
}

/** Group mapped hooks by native event, then by matcher, into Claude's shape. */
function hooksConfig(mapped: MappedHook[]) {
  const config: Record<string, Array<Record<string, unknown>>> = {};
  for (const { native, hook } of mapped) {
    const byEvent = (config[native] ??= []);
    const matcher = hook.matcher ?? "";
    let group = byEvent.find((g) => g.matcher === matcher);
    if (!group) {
      group = { matcher, hooks: [] as Array<Record<string, unknown>> };
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

function fullCommand(hook: MappedHook["hook"]): string {
  const { command, args } = hook.handler;
  return args && args.length ? `${command} ${args.join(" ")}` : command;
}
