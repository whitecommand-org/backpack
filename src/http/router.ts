import type { WorkspaceRegistry } from "../infrastructure/index.ts";
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
 * `Bun.serve({ fetch })`. Multi-workspace: every request names its folder.
 */
export function router(
  registry: WorkspaceRegistry,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handle(registry, req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

async function handle(registry: WorkspaceRegistry, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const segs = url.pathname.split("/").filter(Boolean);
  const method = req.method.toUpperCase();
  const body: Body = method === "POST" || method === "PUT" ? await readBody(req) : {};

  if (method === "GET" && segs[0] === "health") return json({ ok: true });
  if (method === "GET" && segs[0] === "targets")
    return json({ targets: registry.targets() });

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
