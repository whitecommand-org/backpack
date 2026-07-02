/**
 * Minimal TOML serialization helpers for the Codex `config.toml`. We build table
 * headers explicitly in the adapter and use these helpers for keys and values,
 * which keeps the output predictable without pulling in a TOML dependency.
 */

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

/** Quote a table/key segment only when it isn't a bare key. */
export function tomlKey(key: string): string {
  return BARE_KEY.test(key) ? key : JSON.stringify(key);
}

/** Dotted table path, quoting each segment as needed: `mcp_servers."my.srv"`. */
export function tomlPath(...segments: string[]): string {
  return segments.map(tomlKey).join(".");
}

type Scalar = string | number | boolean;
export type TomlValue =
  | Scalar
  | Scalar[]
  | { [key: string]: Scalar | Scalar[] };

function scalar(value: Scalar): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export function tomlValue(value: TomlValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(scalar).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(
      ([k, v]) =>
        `${tomlKey(k)} = ${Array.isArray(v) ? `[${v.map(scalar).join(", ")}]` : scalar(v)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return scalar(value);
}

/** Render a flat set of `key = value` lines, skipping undefined. */
export function tomlKeyValues(
  entries: Record<string, TomlValue | undefined>,
): string {
  return Object.entries(entries)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${tomlKey(k)} = ${tomlValue(v as TomlValue)}`)
    .join("\n");
}
