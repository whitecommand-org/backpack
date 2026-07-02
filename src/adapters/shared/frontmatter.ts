/**
 * Parse a markdown file with an optional YAML frontmatter block into its data and
 * body. Mirror of `withFrontmatter` in `yaml.ts`. Uses Bun's built-in YAML parser.
 */
export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
  /** Set when the frontmatter block was present but could not be parsed as YAML. */
  error?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(markdown: string): Frontmatter {
  const match = markdown.match(FRONTMATTER);
  if (!match) return { data: {}, body: markdown.trim() };

  const raw = match[1] ?? "";
  const body = markdown.slice(match[0].length).trim();
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(raw);
  } catch (err) {
    // Bun's YAML parser is strict; real-world agent/skill frontmatter often has
    // unquoted single-line descriptions containing colons or quotes (e.g.
    // "description: Use when: 'x'") that spec-compliant YAML rejects but Claude
    // Code accepts. Fall back to a lenient flat key/value parse before giving up.
    const data = parseFlatFrontmatter(raw);
    return Object.keys(data).length > 0
      ? { data, body }
      : { data, body, error: err instanceof Error ? err.message : String(err) };
  }
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body };
}

/**
 * Best-effort parse of flat `key: value` frontmatter that strict YAML rejects.
 * Values are read as raw strings (everything after the first `: `), so colons and
 * quotes inside a description survive; simple block lists (`- item`) and boolean
 * literals are recovered too. Only used as a fallback when `Bun.YAML.parse` throws.
 */
function parseFlatFrontmatter(yaml: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let key: string | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      const list = Array.isArray(data[key]) ? (data[key] as unknown[]) : (data[key] = []);
      (list as unknown[]).push(coerce(unquote(item[1]!.trim())));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):(?:\s+(.*))?$/);
    if (kv) {
      key = kv[1]!;
      const value = kv[2]?.trim() ?? "";
      data[key] = value === "" ? "" : coerce(unquote(value));
      continue;
    }

    // Wrapped continuation of the previous scalar value.
    if (key && typeof data[key] === "string") {
      data[key] = `${data[key]} ${line.trim()}`.trim();
    }
  }
  return data;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const q = value[0];
    if ((q === '"' || q === "'") && value.at(-1) === q) return value.slice(1, -1);
  }
  return value;
}

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

/** Normalize a frontmatter tools field (string "a, b" or a list) to string[]. */
export function toStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string")
    return value
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  return undefined;
}
