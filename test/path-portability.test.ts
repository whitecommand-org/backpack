import { test, expect } from "bun:test";
import {
  defineBackpack,
  mcpServerFromEntry,
  resolveMcpServers,
  hooksFromSettings,
  mapHooksForExport,
  reverseHookEventMap,
  CLAUDE_HOOK_EVENTS,
  toPortableString,
  toLocalString,
} from "../src/index.ts";

const A = "/Users/me";
const B = "/home/alice";

test("string tokenize/expand round-trips across machines", () => {
  expect(toPortableString("/Users/me/.local/bin/mcp", A)).toBe("${HOME}/.local/bin/mcp");
  expect(toPortableString("~/bin/x", A)).toBe("${HOME}/bin/x");
  expect(toPortableString("$HOME/bin/x", A)).toBe("${HOME}/bin/x");
  expect(toPortableString("/opt/x", A)).toBe("/opt/x"); // non-home untouched
  expect(toLocalString("${HOME}/.local/bin/mcp", B)).toBe("/home/alice/.local/bin/mcp");
});

test("import tokenizes home paths in an MCP server", () => {
  const server = mcpServerFromEntry(
    "db",
    {
      command: "/Users/me/.local/bin/mcp",
      args: ["--root", "/Users/me/proj"],
      cwd: "/Users/me/proj",
      env: { DATA: "/Users/me/data", KEEP: "/opt/x" },
    },
    A,
  );
  const c = server.connection as any;
  expect(c.command).toBe("${HOME}/.local/bin/mcp");
  expect(c.args).toEqual(["--root", "${HOME}/proj"]);
  expect(c.cwd).toBe("${HOME}/proj");
  expect(c.env).toEqual({ DATA: "${HOME}/data", KEEP: "/opt/x" });
});

test("export expands the token to the local machine's home", () => {
  const bp = defineBackpack({
    mcpServers: [
      {
        id: "db",
        name: "DB",
        description: "d",
        connection: {
          type: "stdio",
          command: "${HOME}/.local/bin/mcp",
          args: ["--root", "${HOME}/proj"],
          cwd: "${HOME}/proj",
          env: { DATA: "${HOME}/data" },
        },
      },
    ],
  });
  const { servers } = resolveMcpServers(bp, undefined, B);
  const c = servers[0]!.connection as any;
  expect(c.command).toBe("/home/alice/.local/bin/mcp");
  expect(c.args).toEqual(["--root", "/home/alice/proj"]);
  expect(c.cwd).toBe("/home/alice/proj");
  expect(c.env.DATA).toBe("/home/alice/data");
});

test("hook commands are portable on import and localized on export", () => {
  // Import (machine A) tokenizes the home path.
  const settings = {
    hooks: {
      PreToolUse: [{ hooks: [{ command: "/Users/me/.claude/hooks/guard.sh" }] }],
    },
  };
  const { hooks } = hooksFromSettings(settings, "test", reverseHookEventMap(CLAUDE_HOOK_EVENTS), A);
  expect(hooks[0]!.handler.command).toBe("${HOME}/.claude/hooks/guard.sh");

  // Export (machine B) expands it.
  const { mapped } = mapHooksForExport(hooks, CLAUDE_HOOK_EVENTS, "Claude Code", B);
  expect(mapped[0]!.hook.handler.command).toBe("/home/alice/.claude/hooks/guard.sh");
});
