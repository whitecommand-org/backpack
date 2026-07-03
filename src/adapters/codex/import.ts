import type { Importer, SourceReader, ImportResult } from "../../core/importer.ts";
import type { Diagnostic } from "../../core/adapter.ts";
import type { McpServer, Agent, Command, ApprovalMode } from "../../core/index.ts";
import {
  slugify,
  isGeneratedToolServer,
  mcpServerFromEntry,
  hooksFromSettings,
  reverseHookEventMap,
  CODEX_HOOK_EVENTS,
} from "../shared/index.ts";

/** Parses Codex CLI config (`config.toml`, prompts) into portable capabilities. */
export function codexImporter(): Importer {
  return {
    id: "codex",
    displayName: "Codex CLI",
    async import(reader: SourceReader): Promise<ImportResult> {
      const diagnostics: Diagnostic[] = [];
      const mcpServers: McpServer[] = [];
      const agents: Agent[] = [];
      const commands: Command[] = [];

      const tomlRaw = await reader.read(".codex/config.toml");
      let config: Record<string, unknown> = {};
      if (tomlRaw) {
        try {
          config = Bun.TOML.parse(tomlRaw) as Record<string, unknown>;
        } catch {
          diagnostics.push({
            level: "error",
            capabilityId: "backpack",
            message: `${reader.label}: failed to parse .codex/config.toml.`,
          });
        }
      }

      // [mcp_servers.*]
      const servers = asRecord(config.mcp_servers);
      for (const [id, raw] of Object.entries(servers)) {
        const entry = asRecord(raw);
        const server = mcpServerFromEntry(id, entry);
        if (isGeneratedToolServer(server)) {
          diagnostics.push({
            level: "warn",
            capabilityId: server.id,
            message: `${reader.label}: skipped generated tools-server "${id}".`,
          });
          continue;
        }
        applyCodexServerExtras(server, entry);
        mcpServers.push(server);
      }

      // [agents.*] — Codex has no inline system prompt to recover.
      const agentEntries = asRecord(config.agents);
      for (const [id, raw] of Object.entries(agentEntries)) {
        const entry = asRecord(raw);
        if (typeof entry.description !== "string") continue; // skip globals (max_threads, ...)
        const nick = Array.isArray(entry.nickname_candidates)
          ? String(entry.nickname_candidates[0] ?? id)
          : id;
        agents.push({
          id: slugify(id),
          name: nick,
          description: entry.description,
          enabled: true,
          systemPrompt: `(imported from Codex — original system prompt unavailable)`,
        });
        diagnostics.push({
          level: "warn",
          capabilityId: slugify(id),
          message: `${reader.label}: Codex agent "${id}" has no recoverable system prompt.`,
        });
      }

      // [[hooks.*]] — same shape as settings hooks.
      const { hooks, diagnostics: hookDiags } = hooksFromSettings(
        config,
        reader.label,
        reverseHookEventMap(CODEX_HOOK_EVENTS),
      );
      diagnostics.push(...hookDiags);

      // .codex/prompts/*.md → commands (skills also land here; indistinguishable).
      for (const path of await reader.list(".codex/prompts", "*.md")) {
        const body = await reader.read(path);
        if (body == null) continue;
        const id = slugify(path.split("/").pop() ?? path);
        commands.push({
          id,
          name: id,
          description: `Imported ${id} prompt`,
          enabled: true,
          body: body.trim() || id,
        });
      }

      return {
        capabilities: { mcpServers, agents, commands, hooks },
        diagnostics,
      };
    },
  };
}

/** Map Codex-specific MCP fields (approval, tool filters, timeouts) back onto the server. */
function applyCodexServerExtras(server: McpServer, entry: Record<string, unknown>) {
  const approval = entry.default_tools_approval_mode;
  if (approval === "auto" || approval === "prompt" || approval === "approve") {
    server.approval = approval as ApprovalMode;
  }
  const allow = entry.enabled_tools;
  const deny = entry.disabled_tools;
  if (Array.isArray(allow) || Array.isArray(deny)) {
    server.toolFilter = {
      ...(Array.isArray(allow) ? { allow: allow.map(String) } : {}),
      ...(Array.isArray(deny) ? { deny: deny.map(String) } : {}),
    };
  }
  const startupSec = entry.startup_timeout_sec;
  const toolSec = entry.tool_timeout_sec;
  if (typeof startupSec === "number" || typeof toolSec === "number") {
    server.timeouts = {
      ...(typeof startupSec === "number" ? { startupSec } : {}),
      ...(typeof toolSec === "number" ? { toolSec } : {}),
    };
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
