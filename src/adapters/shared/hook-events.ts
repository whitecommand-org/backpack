import type { HookEvent, Hook } from "../../core/index.ts";
import type { Diagnostic } from "../../core/adapter.ts";

/**
 * Maps normalized `HookEvent`s to a target tool's native event name. A key that is
 * **absent** means the target has no equivalent — adapters skip that hook (with a
 * diagnostic) rather than emit an event name the tool wouldn't recognize.
 */
export type HookEventMap = Partial<Record<HookEvent, string>>;

/** Claude Code uses our normalized names verbatim (it's the superset). */
export const CLAUDE_HOOK_EVENTS: HookEventMap = {
  SessionStart: "SessionStart",
  SessionEnd: "SessionEnd",
  UserPromptSubmit: "UserPromptSubmit",
  PreToolUse: "PreToolUse",
  PostToolUse: "PostToolUse",
  Stop: "Stop",
  PreCompact: "PreCompact",
  PostCompact: "PostCompact",
  SubagentStart: "SubagentStart",
  SubagentStop: "SubagentStop",
};

/** Codex matches Claude's PascalCase names but has no `SessionEnd`. */
export const CODEX_HOOK_EVENTS: HookEventMap = {
  SessionStart: "SessionStart",
  UserPromptSubmit: "UserPromptSubmit",
  PreToolUse: "PreToolUse",
  PostToolUse: "PostToolUse",
  Stop: "Stop",
  PreCompact: "PreCompact",
  PostCompact: "PostCompact",
  SubagentStart: "SubagentStart",
  SubagentStop: "SubagentStop",
};

/** Copilot CLI uses camelCase, renames a few, and has no `PostCompact`. */
export const COPILOT_HOOK_EVENTS: HookEventMap = {
  SessionStart: "sessionStart",
  SessionEnd: "sessionEnd",
  UserPromptSubmit: "userPromptSubmitted",
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  Stop: "agentStop",
  PreCompact: "preCompact",
  SubagentStart: "subagentStart",
  SubagentStop: "subagentStop",
};

/** The normalized events a map supports (its keys). */
export function supportedHookEvents(map: HookEventMap): HookEvent[] {
  return Object.keys(map) as HookEvent[];
}

/** Invert a map: native event name → normalized `HookEvent` (for import). */
export function reverseHookEventMap(map: HookEventMap): Record<string, HookEvent> {
  const out: Record<string, HookEvent> = {};
  for (const [normalized, native] of Object.entries(map)) {
    if (native) out[native] = normalized as HookEvent;
  }
  return out;
}

export interface MappedHook {
  native: string;
  hook: Hook;
}

/**
 * Translate each hook's event to the target's native name. Hooks whose event has
 * no equivalent are dropped with a `warn` diagnostic. Shared by every adapter so
 * the "map or skip" behavior is identical.
 */
export function mapHooksForExport(
  hooks: Hook[],
  map: HookEventMap,
  tool: string,
): { mapped: MappedHook[]; diagnostics: Diagnostic[] } {
  const mapped: MappedHook[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const hook of hooks) {
    const native = map[hook.event];
    if (!native) {
      diagnostics.push({
        level: "warn",
        capabilityId: hook.id,
        message: `Hook event "${hook.event}" has no equivalent in ${tool}; skipped.`,
      });
      continue;
    }
    mapped.push({ native, hook });
  }
  return { mapped, diagnostics };
}
