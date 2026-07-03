import type { Adapter, EmittedFile, Diagnostic } from "../../core/adapter.ts";
import type { Backpack, McpServer } from "../../core/index.ts";
import {
  resolveMcpServers,
  tomlKeyValues,
  tomlPath,
  DEFAULT_TOOLS_MODULE,
  CODEX_HOOK_EVENTS,
  supportedHookEvents,
  mapHooksForExport,
  type MappedHook,
  type TomlValue,
} from "../shared/index.ts";

export interface CodexOptions {
  toolsModule?: string;
}

/** Codex CLI adapter: emits `.codex/config.toml` and `.codex/prompts/*.md`. */
export function codexAdapter(opts: CodexOptions = {}): Adapter {
  const toolsModule = opts.toolsModule ?? DEFAULT_TOOLS_MODULE;
  return {
    id: "codex",
    displayName: "Codex CLI",
    supports: {
      mcpServers: true,
      tools: true,
      agents: true,
      hooks: true,
      skills: false, // No native skill slot — emitted as prompts.
      commands: true,
      hookEvents: supportedHookEvents(CODEX_HOOK_EVENTS),
    },
    emit(backpack: Backpack) {
      const files: EmittedFile[] = [];
      const diagnostics: Diagnostic[] = [];
      const sections: string[] = [];

      // MCP servers (+ materialized tools server).
      const { servers, toolFile } = resolveMcpServers(backpack, toolsModule);
      if (toolFile) files.push(toolFile);
      for (const server of servers) sections.push(mcpSection(server));

      // Subagents. Codex has no inline system-prompt field.
      for (const agent of backpack.agents) {
        if (!agent.enabled) continue;
        sections.push(
          `[${tomlPath("agents", agent.id)}]\n` +
            tomlKeyValues({
              description: agent.description,
              nickname_candidates: agent.name ? [agent.name] : undefined,
            }),
        );
        diagnostics.push({
          level: "warn",
          capabilityId: agent.id,
          message:
            "Codex agents have no inline system prompt; systemPrompt was not emitted. " +
            "Provide it via the agent's config_file layer.",
        });
      }

      // Hooks (events mapped to Codex's names; unmapped skipped).
      const hooks = backpack.hooks.filter((h) => h.enabled);
      const { mapped, diagnostics: hookDiags } = mapHooksForExport(
        hooks,
        CODEX_HOOK_EVENTS,
        "Codex",
      );
      diagnostics.push(...hookDiags);
      if (mapped.length > 0) {
        sections.push("[features]\nhooks = true");
        sections.push(...hookSections(mapped));
      }

      if (sections.length > 0) {
        files.push({
          path: ".codex/config.toml",
          scope: "project",
          content: sections.join("\n\n") + "\n",
        });
      }

      // Commands → prompts.
      for (const command of backpack.commands) {
        if (!command.enabled) continue;
        files.push({
          path: `.codex/prompts/${command.id}.md`,
          scope: "project",
          content: command.body.trimEnd() + "\n",
        });
      }

      // Skills → prompts (no native slot).
      for (const skill of backpack.skills) {
        if (!skill.enabled) continue;
        files.push({
          path: `.codex/prompts/${skill.id}.md`,
          scope: "project",
          content: skill.body.trimEnd() + "\n",
        });
        diagnostics.push({
          level: "warn",
          capabilityId: skill.id,
          message:
            "Codex has no skill capability; emitted as a prompt at " +
            `.codex/prompts/${skill.id}.md.`,
        });
      }

      return { files, diagnostics };
    },
  };
}

function mcpSection(server: McpServer): string {
  const c = server.connection;
  const entries: Record<string, TomlValue | undefined> = {
    startup_timeout_sec: server.timeouts?.startupSec,
    tool_timeout_sec: server.timeouts?.toolSec,
    enabled_tools: server.toolFilter?.allow,
    disabled_tools: server.toolFilter?.deny,
    default_tools_approval_mode: server.approval,
  };
  if (c.type === "stdio") {
    entries.command = c.command;
    if (c.args.length) entries.args = c.args;
    if (c.env) entries.env = c.env;
    if (c.cwd) entries.cwd = c.cwd;
  } else {
    entries.url = c.url;
  }
  return `[${tomlPath("mcp_servers", server.id)}]\n` + tomlKeyValues(entries);
}

/** Group mapped hooks by native event + matcher into Codex's arrays-of-tables shape. */
function hookSections(mapped: MappedHook[]): string[] {
  const byEvent = new Map<string, MappedHook[]>();
  for (const m of mapped) {
    const list = byEvent.get(m.native) ?? [];
    list.push(m);
    byEvent.set(m.native, list);
  }
  const out: string[] = [];
  for (const [event, list] of byEvent) {
    // One matcher-group per distinct matcher.
    const matchers = new Map<string, MappedHook[]>();
    for (const m of list) {
      const key = m.hook.matcher ?? "";
      const g = matchers.get(key) ?? [];
      g.push(m);
      matchers.set(key, g);
    }
    for (const [matcher, group] of matchers) {
      let section = `[[${tomlPath("hooks", event)}]]`;
      if (matcher) section += `\n${tomlKeyValues({ matcher })}`;
      for (const { hook } of group) {
        section +=
          `\n\n[[${tomlPath("hooks", event, "hooks")}]]\n` +
          tomlKeyValues({
            command: fullCommand(hook),
            commandWindows: hook.handler.commandWindows,
          });
      }
      out.push(section);
    }
  }
  return out;
}

function fullCommand(hook: MappedHook["hook"]): string {
  const { command, args } = hook.handler;
  return args && args.length ? `${command} ${args.join(" ")}` : command;
}
