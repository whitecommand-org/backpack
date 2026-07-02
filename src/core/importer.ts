import type { Diagnostic } from "./adapter.ts";
import type { McpServer } from "./schemas/mcp-server.ts";
import type { Agent } from "./schemas/agent.ts";
import type { Hook } from "./schemas/hook.ts";
import type { Skill } from "./schemas/skill.ts";
import type { Command } from "./schemas/command.ts";

/**
 * Read-only view of a config location, so importers stay filesystem-agnostic and
 * testable. Paths are relative to the reader's base (a project root or a home dir).
 */
export interface SourceReader {
  /** A label for diagnostics, e.g. "project" or "~". */
  label: string;
  /** Return the file's text, or null if it doesn't exist. */
  read(relPath: string): Promise<string | null>;
  /** List files under `dir` matching an optional glob, as relative paths. */
  list(dir: string, glob?: string): Promise<string[]>;
}

/**
 * Capabilities recovered from a config. There is no `tools`: a tool's live
 * handler never exists in a config file, and a materialized tool-server comes
 * back as an `mcpServers` entry (which importers skip when it's ours).
 */
export interface ImportedCapabilities {
  mcpServers: McpServer[];
  agents: Agent[];
  hooks: Hook[];
  skills: Skill[];
  commands: Command[];
}

export interface ImportResult {
  capabilities: Partial<ImportedCapabilities>;
  diagnostics: Diagnostic[];
}

/** Parses a target tool's config files back into portable capabilities. */
export interface Importer {
  id: string;
  displayName: string;
  import(reader: SourceReader): Promise<ImportResult>;
}
