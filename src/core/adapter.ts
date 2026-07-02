import type { Backpack } from "./schemas/backpack.ts";
import type { HookEvent } from "./schemas/events.ts";

/** Where an emitted file is meant to live. */
export type FileScope = "project" | "user";

/** A single file an adapter wants written to disk. */
export interface EmittedFile {
  /** Path relative to the target root (e.g. ".mcp.json", ".claude/agents/x.md"). */
  path: string;
  content: string;
  scope: FileScope;
}

/** A non-fatal notice about something a target can't fully express. */
export interface Diagnostic {
  level: "warn" | "error";
  /** The capability id this diagnostic refers to, or "backpack" for global. */
  capabilityId: string;
  message: string;
}

export interface EmitResult {
  files: EmittedFile[];
  diagnostics: Diagnostic[];
}

/** Declares what a target can express, so callers can inspect coverage up front. */
export interface CapabilitySupport {
  mcpServers: boolean;
  tools: boolean;
  agents: boolean;
  hooks: boolean;
  skills: boolean;
  commands: boolean;
  /** Hook events the target can map natively; others become diagnostics. */
  hookEvents: readonly HookEvent[];
}

/**
 * Turns a portable `Backpack` into a target tool's native config files.
 * `emit` is pure: it returns file contents and diagnostics and never touches the
 * filesystem or throws for unsupported capabilities (those become diagnostics).
 */
export interface Adapter {
  id: string;
  displayName: string;
  supports: CapabilitySupport;
  emit(backpack: Backpack): EmitResult;
}
