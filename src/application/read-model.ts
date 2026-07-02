import type { CapabilityRow, CapabilityKind } from "./ports.ts";
import { CAPABILITY_KINDS } from "./ports.ts";
import type { CapabilitySummary, CapabilityDetail, Overview } from "./dto.ts";

/**
 * The read layer: projects raw SQLite rows into human-readable DTOs. Reads the
 * stored `data` JSON directly, so it never needs a tool handler or a zod revive.
 */

export function summaryFromRow(row: CapabilityRow): CapabilitySummary {
  const cap = parse(row.data);
  return {
    kind: row.kind,
    id: row.id,
    name: row.name,
    description: row.description,
    detail: detailLine(row.kind, cap),
  };
}

export function detailFromRow(row: CapabilityRow): CapabilityDetail {
  const cap = parse(row.data);
  return {
    ...summaryFromRow(row),
    fields: fieldsFor(row.kind, cap),
    updatedAt: row.updatedAt,
  };
}

export function overviewFromRows(rows: CapabilityRow[]): Overview {
  const byKind = Object.fromEntries(
    CAPABILITY_KINDS.map((k) => [k, 0]),
  ) as Record<CapabilityKind, number>;
  for (const row of rows) byKind[row.kind]++;
  return { total: rows.length, byKind };
}

function detailLine(kind: CapabilityKind, cap: Record<string, unknown>): string {
  switch (kind) {
    case "mcpServers": {
      const c = asRecord(cap.connection);
      if (c.type === "stdio") {
        const args = Array.isArray(c.args) ? c.args.join(" ") : "";
        return `stdio: ${String(c.command ?? "")}${args ? " " + args : ""}`.trim();
      }
      return `${String(c.type ?? "http")}: ${String(c.url ?? "")}`;
    }
    case "agents": {
      const tools = cap.tools;
      const count = Array.isArray(tools) ? `${tools.length} tools` : "all tools";
      return `model ${String(cap.model ?? "inherit")} · ${count}`;
    }
    case "hooks": {
      const h = asRecord(cap.handler);
      const matcher = cap.matcher ? ` ${String(cap.matcher)}` : "";
      return `${String(cap.event ?? "")}${matcher} → ${String(h.command ?? "")}`;
    }
    case "skills":
      return invocationSummary(cap);
    case "commands": {
      const args = Array.isArray(cap.arguments)
        ? cap.arguments.map((a) => asRecord(a).name).filter(Boolean).join(", ")
        : "";
      return args ? `args: ${args}` : firstLine(String(cap.body ?? ""));
    }
    case "tools":
      return `params: ${paramNames(cap).join(", ") || "none"}`;
  }
}

function fieldsFor(kind: CapabilityKind, cap: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case "mcpServers": {
      const c = asRecord(cap.connection);
      return {
        transport: c.type,
        endpoint:
          c.type === "stdio"
            ? [c.command, ...(Array.isArray(c.args) ? c.args : [])].join(" ").trim()
            : c.url,
        ...(cap.approval ? { approval: cap.approval } : {}),
        ...(cap.toolFilter ? { toolFilter: cap.toolFilter } : {}),
      };
    }
    case "agents":
      return {
        model: cap.model ?? "inherit",
        tools: cap.tools ?? "all",
        ...(cap.skills ? { skills: cap.skills } : {}),
        ...(cap.mcpServers ? { mcpServers: cap.mcpServers } : {}),
      };
    case "hooks":
      return {
        event: cap.event,
        matcher: cap.matcher ?? "*",
        command: asRecord(cap.handler).command,
        ...(asRecord(cap.handler).timeout
          ? { timeout: asRecord(cap.handler).timeout }
          : {}),
      };
    case "skills":
      return {
        invocation: invocationSummary(cap),
        ...(cap.allowedTools ? { allowedTools: cap.allowedTools } : {}),
        ...(cap.model ? { model: cap.model } : {}),
        bodyPreview: firstLine(String(cap.body ?? "")),
      };
    case "commands":
      return {
        arguments: cap.arguments ?? [],
        ...(cap.allowedTools ? { allowedTools: cap.allowedTools } : {}),
        ...(cap.model ? { model: cap.model } : {}),
        bodyPreview: firstLine(String(cap.body ?? "")),
      };
    case "tools":
      return { parameters: cap.parameters, paramNames: paramNames(cap) };
  }
}

function invocationSummary(cap: Record<string, unknown>): string {
  const inv = asRecord(cap.invocation);
  const model = inv.modelInvocable !== false;
  const user = inv.userInvocable !== false;
  if (model && user) return "auto + manual";
  if (model) return "auto only";
  if (user) return "manual only";
  return "disabled";
}

function paramNames(cap: Record<string, unknown>): string[] {
  const props = asRecord(asRecord(cap.parameters).properties);
  return Object.keys(props);
}

function firstLine(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
}

function parse(data: string): Record<string, unknown> {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
