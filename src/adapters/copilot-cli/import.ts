import type { Importer, SourceReader, ImportResult } from "../../core/importer.ts";
import type { Diagnostic } from "../../core/adapter.ts";
import type { McpServer, Agent } from "../../core/index.ts";
import {
  parseFrontmatter,
  toStringArray,
  slugify,
  isGeneratedToolServer,
  mcpServerFromEntry,
  hooksFromSettings,
} from "../shared/index.ts";

/** Parses GitHub Copilot CLI config into portable capabilities. */
export function copilotCliImporter(): Importer {
  return {
    id: "copilot-cli",
    displayName: "GitHub Copilot CLI",
    async import(reader: SourceReader): Promise<ImportResult> {
      const diagnostics: Diagnostic[] = [];
      const mcpServers: McpServer[] = [];
      const agents: Agent[] = [];

      // .copilot/mcp-config.json
      const mcpRaw = await reader.read(".copilot/mcp-config.json");
      if (mcpRaw) {
        const parsed = safeJson(mcpRaw, diagnostics);
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
          const tools = toStringArray(entry.tools);
          if (tools) server.toolFilter = { allow: tools };
          mcpServers.push(server);
        }
      }

      // .github/agents/*.md
      for (const path of await reader.list(".github/agents", "*.md")) {
        const md = await reader.read(path);
        if (md) agents.push(agentFromMarkdown(path, md, reader.label, diagnostics));
      }

      // .copilot/settings.json → hooks
      const settingsRaw = await reader.read(".copilot/settings.json");
      const { hooks, diagnostics: hookDiags } = hooksFromSettings(
        settingsRaw ? safeJson(settingsRaw, diagnostics) : undefined,
        reader.label,
      );
      diagnostics.push(...hookDiags);

      return { capabilities: { mcpServers, agents, hooks }, diagnostics };
    },
  };
}

function agentFromMarkdown(
  path: string,
  md: string,
  label: string,
  diagnostics: Diagnostic[],
): Agent {
  const { data, body, error } = parseFrontmatter(md);
  if (error) {
    diagnostics.push({
      level: "warn",
      capabilityId: "backpack",
      message: `${label}: ignored invalid frontmatter in ${path} (${error}).`,
    });
  }
  const id = slugify(String(data.name ?? path.split("/").pop() ?? path));
  return {
    id,
    name: String(data.name ?? id),
    description: String(data.description ?? id),
    enabled: true,
    systemPrompt: body || id,
    ...(toStringArray(data.tools) ? { tools: toStringArray(data.tools) } : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(typeof data["disable-model-invocation"] === "boolean"
      ? { disableModelInvocation: data["disable-model-invocation"] }
      : {}),
    ...(typeof data["user-invocable"] === "boolean"
      ? { userInvocable: data["user-invocable"] }
      : {}),
  };
}

function safeJson(
  raw: string,
  diagnostics: Diagnostic[],
): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    diagnostics.push({
      level: "error",
      capabilityId: "backpack",
      message: "Failed to parse Copilot JSON config.",
    });
    return undefined;
  }
}
