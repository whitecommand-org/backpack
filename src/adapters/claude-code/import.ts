import type { Importer, SourceReader, ImportResult } from "../../core/importer.ts";
import type { Diagnostic } from "../../core/adapter.ts";
import type { McpServer, Agent, Skill, Command } from "../../core/index.ts";
import {
  parseFrontmatter,
  toStringArray,
  slugify,
  isGeneratedToolServer,
  mcpServerFromEntry,
  hooksFromSettings,
  argumentsFromHint,
} from "../shared/index.ts";

/** Parses Claude Code project/user config back into portable capabilities. */
export function claudeCodeImporter(): Importer {
  return {
    id: "claude-code",
    displayName: "Claude Code",
    async import(reader: SourceReader): Promise<ImportResult> {
      const diagnostics: Diagnostic[] = [];
      const mcpServers: McpServer[] = [];
      const agents: Agent[] = [];
      const skills: Skill[] = [];
      const commands: Command[] = [];

      // .mcp.json
      const mcpRaw = await reader.read(".mcp.json");
      if (mcpRaw) {
        const parsed = safeJson(mcpRaw, ".mcp.json", diagnostics);
        const servers = (parsed?.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
        for (const [id, entry] of Object.entries(servers)) {
          const server = mcpServerFromEntry(id, entry);
          if (isGeneratedToolServer(server)) {
            diagnostics.push({
              level: "warn",
              capabilityId: server.id,
              message: `${reader.label}: skipped generated tools-server "${id}".`,
            });
            continue;
          }
          mcpServers.push(server);
        }
      }

      // .claude/agents/*.md
      for (const path of await reader.list(".claude/agents", "*.md")) {
        const md = await reader.read(path);
        if (md) agents.push(agentFromMarkdown(path, md, reader.label, diagnostics));
      }

      // .claude/skills/*/SKILL.md
      for (const path of await reader.list(".claude/skills", "*/SKILL.md")) {
        const md = await reader.read(path);
        if (md) skills.push(skillFromMarkdown(path, md, reader.label, diagnostics));
      }

      // .claude/commands/*.md
      for (const path of await reader.list(".claude/commands", "*.md")) {
        const md = await reader.read(path);
        if (md) commands.push(commandFromMarkdown(path, md, reader.label, diagnostics));
      }

      // .claude/settings.json → hooks
      const settingsRaw = await reader.read(".claude/settings.json");
      const parsedSettings = settingsRaw
        ? safeJson(settingsRaw, ".claude/settings.json", diagnostics)
        : undefined;
      const { hooks, diagnostics: hookDiags } = hooksFromSettings(
        parsedSettings,
        reader.label,
      );
      diagnostics.push(...hookDiags);

      return {
        capabilities: { mcpServers, agents, skills, commands, hooks },
        diagnostics,
      };
    },
  };
}

function baseId(path: string): string {
  return slugify(path.split("/").pop() ?? path);
}

/** Warn (once) when a file's frontmatter block was present but unparseable. */
function reportFrontmatterError(
  path: string,
  error: string | undefined,
  label: string,
  diagnostics: Diagnostic[],
): void {
  if (!error) return;
  diagnostics.push({
    level: "warn",
    capabilityId: "backpack",
    message: `${label}: ignored invalid frontmatter in ${path} (${error}).`,
  });
}

function agentFromMarkdown(
  path: string,
  md: string,
  label: string,
  diagnostics: Diagnostic[],
): Agent {
  const { data, body, error } = parseFrontmatter(md);
  reportFrontmatterError(path, error, label, diagnostics);
  const id = slugify(String(data.name ?? baseId(path)));
  return {
    id,
    name: String(data.name ?? id),
    description: String(data.description ?? id),
    enabled: true,
    systemPrompt: body || id,
    ...(toStringArray(data.tools) ? { tools: toStringArray(data.tools) } : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
  };
}

function skillFromMarkdown(
  path: string,
  md: string,
  label: string,
  diagnostics: Diagnostic[],
): Skill {
  const { data, body, error } = parseFrontmatter(md);
  reportFrontmatterError(path, error, label, diagnostics);
  // Directory name (…/skills/<id>/SKILL.md) is the canonical id.
  const dir = path.split("/").at(-2);
  const id = slugify(String(data.name ?? dir ?? baseId(path)));
  const invocation: NonNullable<Skill["invocation"]> = {};
  if (data["disable-model-invocation"] === true) invocation.modelInvocable = false;
  if (data["user-invocable"] === false) invocation.userInvocable = false;
  return {
    id,
    name: String(data.name ?? id),
    description: String(data.description ?? id),
    enabled: true,
    body: body || id,
    ...(Object.keys(invocation).length ? { invocation } : {}),
    ...(toStringArray(data["allowed-tools"])
      ? { allowedTools: toStringArray(data["allowed-tools"]) }
      : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
  };
}

function commandFromMarkdown(
  path: string,
  md: string,
  label: string,
  diagnostics: Diagnostic[],
): Command {
  const { data, body, error } = parseFrontmatter(md);
  reportFrontmatterError(path, error, label, diagnostics);
  const id = baseId(path);
  const args = argumentsFromHint(data["argument-hint"]);
  return {
    id,
    name: id,
    description: String(data.description ?? id),
    enabled: true,
    body: body || id,
    ...(args ? { arguments: args } : {}),
    ...(toStringArray(data["allowed-tools"])
      ? { allowedTools: toStringArray(data["allowed-tools"]) }
      : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
  };
}

function safeJson(
  raw: string,
  path: string,
  diagnostics: Diagnostic[],
): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    diagnostics.push({
      level: "error",
      capabilityId: "backpack",
      message: `Failed to parse ${path} as JSON.`,
    });
    return undefined;
  }
}
