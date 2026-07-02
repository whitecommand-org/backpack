import { z } from "zod";

/**
 * Normalized lifecycle events for hooks. This is the union of what Claude Code,
 * Codex and Copilot expose. Not every target supports every event — adapters map
 * each event to their native name or emit a diagnostic when unsupported.
 *
 * Support matrix (see each adapter's `supports.hooks.events`):
 * - Claude Code: all of these (plus many more it exposes natively).
 * - Codex:       PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, Stop,
 *                PreCompact, PostCompact, SubagentStart, SubagentStop.
 * - Copilot:     PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, Stop.
 */
export const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PreCompact",
  "PostCompact",
  "SubagentStart",
  "SubagentStop",
] as const;

export const HookEvent = z.enum(HOOK_EVENTS);
export type HookEvent = z.infer<typeof HookEvent>;
