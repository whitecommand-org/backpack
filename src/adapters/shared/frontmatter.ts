/**
 * Parse a markdown file with an optional YAML frontmatter block into its data and
 * body. Mirror of `withFrontmatter` in `yaml.ts`. Uses Bun's built-in YAML parser.
 */
export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(markdown: string): Frontmatter {
  const match = markdown.match(FRONTMATTER);
  if (!match) return { data: {}, body: markdown.trim() };

  const parsed = Bun.YAML.parse(match[1] ?? "");
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body: markdown.slice(match[0].length).trim() };
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
