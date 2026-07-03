import { test, expect } from "bun:test";
import {
  defineBackpack,
  claudeCodeAdapter,
  codexAdapter,
  copilotCliAdapter,
  copilotCliImporter,
  MemoryReader,
  type HookEvent,
} from "../src/index.ts";

function hooksBackpack(events: HookEvent[]) {
  return defineBackpack({
    hooks: events.map((event, i) => ({
      id: `h${i}-${event.toLowerCase()}`,
      name: event,
      description: `hook ${event}`,
      event,
      handler: { type: "command", command: `./${event}.sh` },
    })),
  });
}

const fileMap = (files: { path: string; content: string }[]) =>
  new Map(files.map((f) => [f.path, f.content]));

test("events are translated to each destination's native names", () => {
  const bp = hooksBackpack(["UserPromptSubmit", "Stop", "SubagentStop"]);

  const claude = JSON.parse(
    fileMap(claudeCodeAdapter().emit(bp).files).get(".claude/settings.json")!,
  );
  expect(Object.keys(claude.hooks).sort()).toEqual(["Stop", "SubagentStop", "UserPromptSubmit"]);

  const codex = Bun.TOML.parse(
    fileMap(codexAdapter().emit(bp).files).get(".codex/config.toml")!,
  ) as any;
  expect(Object.keys(codex.hooks).sort()).toEqual(["Stop", "SubagentStop", "UserPromptSubmit"]);

  const copilot = JSON.parse(
    fileMap(copilotCliAdapter().emit(bp).files).get(".copilot/settings.json")!,
  );
  // Non-obvious renames: Stop→agentStop, UserPromptSubmit→userPromptSubmitted.
  expect(Object.keys(copilot.hooks).sort()).toEqual([
    "agentStop",
    "subagentStop",
    "userPromptSubmitted",
  ]);
});

test("events with no destination equivalent are skipped with a diagnostic", () => {
  const bp = hooksBackpack(["SessionEnd", "PostCompact"]);

  // Codex has no SessionEnd; Copilot has no PostCompact.
  const codex = codexAdapter().emit(bp);
  const codexToml = Bun.TOML.parse(
    fileMap(codex.files).get(".codex/config.toml")!,
  ) as any;
  expect(Object.keys(codexToml.hooks)).toEqual(["PostCompact"]);
  expect(codex.diagnostics.some((d) => /"SessionEnd" has no equivalent/.test(d.message))).toBe(true);

  const copilot = copilotCliAdapter().emit(bp);
  const copilotSettings = JSON.parse(
    fileMap(copilot.files).get(".copilot/settings.json")!,
  );
  expect(Object.keys(copilotSettings.hooks)).toEqual(["sessionEnd"]);
  expect(copilot.diagnostics.some((d) => /"PostCompact" has no equivalent/.test(d.message))).toBe(true);
});

test("supports.hookEvents reflects each adapter's map", () => {
  expect(claudeCodeAdapter().supports.hookEvents).toContain("SessionEnd");
  expect(codexAdapter().supports.hookEvents).not.toContain("SessionEnd");
  expect(copilotCliAdapter().supports.hookEvents).not.toContain("PostCompact");
  expect(copilotCliAdapter().supports.hookEvents).toContain("Stop"); // normalized name
});

test("Copilot hooks round-trip through emit → import", async () => {
  const bp = hooksBackpack(["UserPromptSubmit", "Stop"]);
  const files = copilotCliAdapter().emit(bp).files;
  const reader = new MemoryReader(
    Object.fromEntries(files.map((f) => [f.path, f.content])),
  );

  const { capabilities } = await copilotCliImporter().import(reader);
  const events = (capabilities.hooks ?? []).map((h) => h.event).sort();
  expect(events).toEqual(["Stop", "UserPromptSubmit"]);
});

test("import skips unmapped native Copilot events", async () => {
  const reader = new MemoryReader({
    ".copilot/settings.json": JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [{ type: "command", bash: "./x.sh" }],
        bogusEvent: [{ type: "command", bash: "./y.sh" }],
      },
    }),
  });
  const { capabilities, diagnostics } = await copilotCliImporter().import(reader);
  expect((capabilities.hooks ?? []).map((h) => h.event)).toEqual(["PreToolUse"]);
  expect(diagnostics.some((d) => /unmapped Copilot hook event "bogusEvent"/.test(d.message))).toBe(true);
});
