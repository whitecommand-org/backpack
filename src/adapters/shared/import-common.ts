import { homedir } from "node:os";
import type { Diagnostic } from "../../core/adapter.ts";
import type { McpServer, Hook, Command } from "../../core/index.ts";
import type { HookEvent } from "../../core/index.ts";
import { slugify } from "./index.ts";
import { toPortableString } from "./path-portability.ts";

/** Reconstruct an `McpServer` from a JSON config entry (Claude/Copilot shape). */
export function mcpServerFromEntry(
  id: string,
  entry: Record<string, unknown>,
  home: string = homedir(),
): McpServer {
  const url = typeof entry.url === "string" ? entry.url : undefined;
  const base = {
    id: slugify(id),
    name: id,
    description: `Imported ${id} MCP server`,
    enabled: true,
  };
  if (url) {
    const type = entry.type === "sse" ? "sse" : "http";
    return {
      ...base,
      connection: {
        type,
        url,
        ...(isRecord(entry.headers) ? { headers: entry.headers as Record<string, string> } : {}),
      },
    };
  }
  const p = (v: string) => toPortableString(v, home);
  const env = isRecord(entry.env)
    ? Object.fromEntries(
        Object.entries(entry.env as Record<string, unknown>).map(([k, v]) => [k, p(String(v))]),
      )
    : undefined;
  return {
    ...base,
    connection: {
      type: "stdio",
      command: p(String(entry.command ?? "")),
      args: Array.isArray(entry.args) ? entry.args.map((a) => p(String(a))) : [],
      ...(env ? { env } : {}),
      ...(typeof entry.cwd === "string" ? { cwd: p(entry.cwd) } : {}),
    },
  };
}

/**
 * Reverse the `{ hooks: { Event: [{ matcher, hooks: [{ command }] }] } }` shape
 * (Claude Code / Codex) back into `Hook[]`. `reverseMap` translates a native event
 * name to a normalized `HookEvent`; native events absent from it are skipped.
 */
export function hooksFromSettings(
  raw: unknown,
  origin: string,
  reverseMap: Record<string, HookEvent>,
  home: string = homedir(),
): { hooks: Hook[]; diagnostics: Diagnostic[] } {
  const hooks: Hook[] = [];
  const diagnostics: Diagnostic[] = [];
  const root = isRecord(raw) && isRecord(raw.hooks) ? raw.hooks : {};

  for (const [event, groups] of Object.entries(root)) {
    const normalized = reverseMap[event];
    if (!normalized) {
      diagnostics.push({
        level: "warn",
        capabilityId: "backpack",
        message: `${origin}: unmapped hook event "${event}" skipped.`,
      });
      continue;
    }
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) continue;
      const matcher =
        typeof group.matcher === "string" && group.matcher.length > 0
          ? group.matcher
          : undefined;
      for (const entry of group.hooks) {
        if (!isRecord(entry) || typeof entry.command !== "string") continue;
        const id = slugify(
          `${normalized}-${matcher ?? "all"}-${hooks.length}`,
        );
        hooks.push({
          id,
          name: id,
          description: `Imported ${normalized} hook`,
          enabled: true,
          event: normalized,
          ...(matcher ? { matcher } : {}),
          handler: {
            type: "command",
            command: toPortableString(entry.command, home),
            ...(typeof entry.timeout === "number"
              ? { timeout: entry.timeout }
              : {}),
          },
        });
      }
    }
  }
  return { hooks, diagnostics };
}

/** Best-effort parse of a Claude `argument-hint` back into command arguments. */
export function argumentsFromHint(
  hint: unknown,
): Command["arguments"] | undefined {
  if (typeof hint !== "string") return undefined;
  const matches = [...hint.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length === 0) return undefined;
  return matches.map((m) => {
    const [name, ...rest] = (m[1] ?? "").split(":");
    const hintText = rest.join(":").trim();
    return {
      name: (name ?? "").trim(),
      ...(hintText ? { hint: hintText } : {}),
    };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
