import type { WorkspaceRegistry, WorkspaceCatalog } from "../infrastructure/index.ts";
import {
  ApplicationError,
  isCapabilityKind,
  type CapabilityKind,
} from "../application/index.ts";
import { json, errorResponse } from "./responses.ts";

type Body = Record<string, unknown>;

/**
 * A pure request handler for the backpack HTTP API. Returned as a plain function
 * so it can be unit-tested with `Request`/`Response` and also handed to
 * `Bun.serve({ fetch })`. Multi-workspace: every request names its folder. An
 * optional `catalog` enables the `/workspaces` management routes.
 */
export function router(
  registry: WorkspaceRegistry,
  catalog?: WorkspaceCatalog,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handle(registry, catalog, req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

async function handle(
  registry: WorkspaceRegistry,
  catalog: WorkspaceCatalog | undefined,
  req: Request,
): Promise<Response> {
  const url = new URL(req.url);
  const segs = url.pathname.split("/").filter(Boolean);
  const method = req.method.toUpperCase();
  const body: Body = method === "POST" || method === "PUT" ? await readBody(req) : {};

  if (method === "GET" && segs[0] === "health") return json({ ok: true });
  if (method === "GET" && segs[0] === "targets")
    return json({ targets: registry.targets() });

  if (segs[0] === "workspaces") {
    return handleWorkspaces(registry, requireCatalog(catalog), method, url, body);
  }

  // All remaining routes operate on a workspace folder.
  const ws = () => registry.open(resolveDir(req, url, body));

  if (segs[0] === "overview" && method === "GET") {
    return json(ws().query.overview());
  }

  if (segs[0] === "capabilities") {
    const workspace = ws();
    if (segs.length === 1 && method === "GET") {
      return json({
        capabilities: workspace.query.list({
          kind: optionalKind(url.searchParams.get("kind")),
          q: url.searchParams.get("q") ?? undefined,
        }),
      });
    }
    if (segs.length === 2) {
      const kind = requireKind(segs[1]!);
      if (method === "GET") return json({ capabilities: workspace.query.list({ kind }) });
      if (method === "POST") return json(workspace.commands.create(kind, body), 201);
    }
    if (segs.length === 3) {
      const kind = requireKind(segs[1]!);
      const id = segs[2]!;
      if (method === "GET") {
        if (url.searchParams.get("raw")) {
          const raw = workspace.query.raw(kind, id);
          if (!raw) throw new ApplicationError("not_found", `${kind} "${id}" not found.`);
          return json(raw);
        }
        const detail = workspace.query.get(kind, id);
        if (!detail) throw new ApplicationError("not_found", `${kind} "${id}" not found.`);
        return json(detail);
      }
      if (method === "PUT") return json(workspace.commands.update(kind, id, body));
      if (method === "DELETE") {
        workspace.commands.remove(kind, id);
        return new Response(null, { status: 204 });
      }
    }
  }

  if (segs[0] === "import" && method === "POST") {
    const targets = Array.isArray(body.targets) ? (body.targets as string[]) : undefined;
    return json(await ws().commands.importFromConfigs({ targets }));
  }

  if (segs[0] === "export" && method === "POST") {
    if (typeof body.target !== "string")
      throw new ApplicationError("bad_request", "Body must include a string 'target'.");
    return json(
      await ws().commands.exportTo({ target: body.target, write: body.write === true }),
    );
  }

  throw new ApplicationError("not_found", `No route for ${method} ${url.pathname}`);
}

async function handleWorkspaces(
  registry: WorkspaceRegistry,
  catalog: WorkspaceCatalog,
  method: string,
  url: URL,
  body: Body,
): Promise<Response> {
  const enrich = (entry: { dir: string; name: string; addedAt: number }) => {
    const o = registry.open(entry.dir).query.overview();
    return { ...entry, total: o.total, byKind: o.byKind };
  };

  if (method === "GET") {
    const entries = await catalog.list();
    return json({ workspaces: entries.map(enrich) });
  }
  if (method === "POST") {
    if (typeof body.dir !== "string" || !body.dir)
      throw new ApplicationError("bad_request", "Body must include a folder 'dir'.");
    registry.open(body.dir); // validate: opens/creates the folder's store
    const entry = await catalog.add(body.dir);
    return json(enrich(entry), 201);
  }
  if (method === "DELETE") {
    const dir = url.searchParams.get("dir") ?? (typeof body.dir === "string" ? body.dir : null);
    if (!dir) throw new ApplicationError("bad_request", "Missing `dir` to remove.");
    await catalog.remove(dir);
    return new Response(null, { status: 204 });
  }
  throw new ApplicationError("not_found", `No route for ${method} /workspaces`);
}

function requireCatalog(catalog: WorkspaceCatalog | undefined): WorkspaceCatalog {
  if (!catalog)
    throw new ApplicationError("bad_request", "Workspace management is not enabled on this server.");
  return catalog;
}

function resolveDir(req: Request, url: URL, body: Body): string {
  const dir =
    (typeof body.dir === "string" && body.dir) ||
    req.headers.get("x-backpack-dir") ||
    url.searchParams.get("dir");
  if (!dir) {
    throw new ApplicationError(
      "bad_request",
      "Missing workspace folder. Provide `dir` in the body, `?dir=`, or an `X-Backpack-Dir` header.",
    );
  }
  return dir;
}

function requireKind(value: string): CapabilityKind {
  if (!isCapabilityKind(value))
    throw new ApplicationError("bad_request", `Unknown capability kind "${value}".`);
  return value;
}

function optionalKind(value: string | null): CapabilityKind | undefined {
  return value ? requireKind(value) : undefined;
}

async function readBody(req: Request): Promise<Body> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Body)
      : {};
  } catch {
    return {};
  }
}
