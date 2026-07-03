// Typed client for the backpack HTTP API. Local types mirror the server DTOs so
// the web layer stays decoupled. Every capability call carries the active folder
// via the `X-Backpack-Dir` header.

export type CapabilityKind =
  | "mcpServers"
  | "tools"
  | "agents"
  | "hooks"
  | "skills"
  | "commands";

export const CAPABILITY_KINDS: CapabilityKind[] = [
  "mcpServers",
  "tools",
  "agents",
  "hooks",
  "skills",
  "commands",
];

export const WRITABLE_KINDS: CapabilityKind[] = [
  "mcpServers",
  "agents",
  "hooks",
  "skills",
  "commands",
];

export interface CapabilitySummary {
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  detail: string;
}

export interface CapabilityDetail extends CapabilitySummary {
  fields: Record<string, unknown>;
  updatedAt: number;
}

export interface Overview {
  total: number;
  byKind: Record<CapabilityKind, number>;
}

export interface WorkspaceEntry {
  dir: string;
  name: string;
  addedAt: number;
  total: number;
  byKind: Record<CapabilityKind, number>;
}

export interface TargetInfo {
  id: string;
  displayName: string;
  supports: Record<string, unknown>;
}

export interface Diagnostic {
  level: "warn" | "error";
  capabilityId: string;
  message: string;
}

export interface ImportSummary {
  imported: Record<string, number>;
  diagnostics: Diagnostic[];
}

export interface ExportSummary {
  target: string;
  files: { path: string; scope: string; content: string }[];
  written?: string[];
  diagnostics: Diagnostic[];
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ReqOptions {
  method?: string;
  dir?: string;
  body?: unknown;
}

async function req<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.dir) headers["X-Backpack-Dir"] = opts.dir;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data?.error ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(err.code ?? "error", err.message ?? res.statusText, err.details);
  }
  return data as T;
}

export const api = {
  targets: () => req<{ targets: TargetInfo[] }>("/targets").then((r) => r.targets),

  listWorkspaces: () =>
    req<{ workspaces: WorkspaceEntry[] }>("/workspaces").then((r) => r.workspaces),
  addWorkspace: (dir: string) =>
    req<WorkspaceEntry>("/workspaces", { method: "POST", body: { dir } }),
  removeWorkspace: (dir: string) =>
    req<void>(`/workspaces?dir=${encodeURIComponent(dir)}`, { method: "DELETE" }),

  overview: (dir: string) => req<Overview>("/overview", { dir }),

  listCapabilities: (dir: string, opts: { kind?: CapabilityKind; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.q) params.set("q", opts.q);
    const qs = params.toString();
    return req<{ capabilities: CapabilitySummary[] }>(
      `/capabilities${qs ? `?${qs}` : ""}`,
      { dir },
    ).then((r) => r.capabilities);
  },
  getCapability: (dir: string, kind: CapabilityKind, id: string) =>
    req<CapabilityDetail>(`/capabilities/${kind}/${encodeURIComponent(id)}`, { dir }),
  getRawCapability: (dir: string, kind: CapabilityKind, id: string) =>
    req<Record<string, unknown>>(
      `/capabilities/${kind}/${encodeURIComponent(id)}?raw=1`,
      { dir },
    ),
  createCapability: (dir: string, kind: CapabilityKind, body: unknown) =>
    req<CapabilityDetail>(`/capabilities/${kind}`, { method: "POST", dir, body }),
  updateCapability: (dir: string, kind: CapabilityKind, id: string, body: unknown) =>
    req<CapabilityDetail>(`/capabilities/${kind}/${encodeURIComponent(id)}`, {
      method: "PUT",
      dir,
      body,
    }),
  removeCapability: (dir: string, kind: CapabilityKind, id: string) =>
    req<void>(`/capabilities/${kind}/${encodeURIComponent(id)}`, { method: "DELETE", dir }),

  importConfigs: (dir: string, targets?: string[]) =>
    req<ImportSummary>("/import", { method: "POST", dir, body: { targets } }),
  exportTarget: (dir: string, target: string, write: boolean) =>
    req<ExportSummary>("/export", { method: "POST", dir, body: { target, write } }),
};
