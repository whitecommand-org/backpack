import { homedir } from "node:os";
import type { McpServer, Hook } from "../../core/index.ts";

/** Machine-independent token stored in place of the user's home directory. */
export const HOME_TOKEN = "${HOME}";

/**
 * Make a value portable: replace occurrences of the (source machine's) home dir —
 * and a leading `~` or `$HOME`/`${HOME}` — with `${HOME}`. Non-home paths are left
 * unchanged. Called on import so the stored backpack is machine-independent.
 */
export function toPortableString(value: string, home: string = homedir()): string {
  let out = value;
  // Normalize a leading `~` (with or without a following slash) to the home dir first.
  if (out === "~") out = home;
  else if (out.startsWith("~/")) out = home + out.slice(1);
  // Any occurrence of the concrete home path → token.
  if (home) out = out.split(home).join(HOME_TOKEN);
  // Existing env-style references → the canonical token.
  out = out.split("${HOME}").join(HOME_TOKEN).split("$HOME").join(HOME_TOKEN);
  return out;
}

/**
 * Expand a portable value for the local machine: replace `${HOME}`/`$HOME`, and a
 * leading `~`, with the (target machine's) home dir. Called on export.
 */
export function toLocalString(value: string, home: string = homedir()): string {
  let out = value;
  if (out === "~") return home;
  if (out.startsWith("~/")) out = home + out.slice(1);
  return out.split("${HOME}").join(home).split("$HOME").join(home);
}

type Transform = (value: string, home: string) => string;

function mapEnv(
  env: Record<string, string> | undefined,
  fn: Transform,
  home: string,
): Record<string, string> | undefined {
  if (!env) return env;
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, fn(v, home)]));
}

function transformServer(server: McpServer, fn: Transform, home: string): McpServer {
  const c = server.connection;
  if (c.type !== "stdio") return server; // urls/headers aren't home paths
  return {
    ...server,
    connection: {
      ...c,
      command: fn(c.command, home),
      args: c.args.map((a) => fn(a, home)),
      ...(c.cwd ? { cwd: fn(c.cwd, home) } : {}),
      ...(c.env ? { env: mapEnv(c.env, fn, home) } : {}),
    },
  };
}

function transformHook(hook: Hook, fn: Transform, home: string): Hook {
  const h = hook.handler;
  return {
    ...hook,
    handler: {
      ...h,
      command: fn(h.command, home),
      ...(h.args ? { args: h.args.map((a) => fn(a, home)) } : {}),
    },
  };
}

export const portablizeServer = (s: McpServer, home?: string): McpServer =>
  transformServer(s, toPortableString, home ?? homedir());
export const localizeServer = (s: McpServer, home?: string): McpServer =>
  transformServer(s, toLocalString, home ?? homedir());
export const portablizeHook = (h: Hook, home?: string): Hook =>
  transformHook(h, toPortableString, home ?? homedir());
export const localizeHook = (h: Hook, home?: string): Hook =>
  transformHook(h, toLocalString, home ?? homedir());
