import { homedir } from "node:os";
import type { Backpack, McpServer } from "../../core/index.ts";
import type { EmittedFile } from "../../core/adapter.ts";
import { materializeTools } from "./tool-to-mcp.ts";
import { localizeServer } from "./path-portability.ts";

export * from "./yaml.ts";
export * from "./toml.ts";
export * from "./tool-to-mcp.ts";
export * from "./reader.ts";
export * from "./frontmatter.ts";
export * from "./hook-events.ts";
export * from "./path-portability.ts";

/** Convert an arbitrary config key/filename into a valid kebab-case capability id. */
export function slugify(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/, "") // drop file extension
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** True for a materialized backpack tools-server, so importers can skip it. */
export function isGeneratedToolServer(server: McpServer): boolean {
  const c = server.connection;
  return (
    c.type === "stdio" &&
    c.args.some((a) => a.includes(".backpack/mcp/"))
  );
}

export * from "./import-common.ts";

/** Default module the generated tools server imports handlers from. */
export const DEFAULT_TOOLS_MODULE = "../../index.ts";

export interface McpResolution {
  /** Explicit servers plus the generated tools server (if any). */
  servers: McpServer[];
  /** The generated tools-server file, when the backpack defines tools. */
  toolFile?: EmittedFile;
}

/**
 * Resolve the full set of MCP servers an adapter should register: the backpack's
 * explicit `mcpServers` plus one generated stdio server hosting all `tools`.
 * Shared by every CLI adapter so tool materialization is consistent.
 */
export function resolveMcpServers(
  backpack: Backpack,
  toolsModule: string = DEFAULT_TOOLS_MODULE,
  home: string = homedir(),
): McpResolution {
  // Expand `${HOME}` in explicit servers to the local machine's home on export.
  const explicit = backpack.mcpServers
    .filter((s) => s.enabled)
    .map((s) => localizeServer(s, home));
  const enabledTools = backpack.tools.filter((t) => t.enabled);
  if (enabledTools.length === 0) return { servers: explicit };

  const { server, file } = materializeTools(enabledTools, { toolsModule });
  return { servers: [...explicit, server], toolFile: file };
}

/** Fall back to the id when a display name is empty. */
export function displayName(cap: { id: string; name?: string }): string {
  return cap.name && cap.name.length > 0 ? cap.name : cap.id;
}
