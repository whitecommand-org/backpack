/**
 * Minimal YAML emitter for the small subset needed in markdown frontmatter:
 * scalars, string/number/boolean arrays, and nested string-keyed maps. Not a
 * general YAML library — it only covers what the adapters produce.
 */
export type YamlValue =
  | string
  | number
  | boolean
  | YamlValue[]
  | { [key: string]: YamlValue }
  | undefined;

function needsQuoting(s: string): boolean {
  return (
    s === "" ||
    /^\s|\s$/.test(s) || // leading/trailing whitespace
    /^(true|false|null|yes|no|~)$/i.test(s) || // reserved words
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || // indicator char at start
    /^[+.\d]/.test(s) || // could be parsed as a number
    /:(\s|$)/.test(s) || // key/value ambiguity
    /\s#/.test(s) || // start of a comment
    /["[\]{}]/.test(s) // flow indicators or quote char anywhere
  );
}

function scalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    return needsQuoting(value) ? JSON.stringify(value) : value;
  }
  return String(value);
}

function isRecord(v: YamlValue): v is { [key: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function emit(value: YamlValue, indent: number): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return (
      "\n" +
      value
        .map((item) => {
          if (isRecord(item) || Array.isArray(item)) {
            return `${pad}-${emitInlineOrBlock(item, indent + 1)}`;
          }
          return `${pad}- ${scalar(item as string | number | boolean)}`;
        })
        .join("\n")
    );
  }
  if (isRecord(value)) {
    return "\n" + emitMap(value, indent);
  }
  return " " + scalar(value as string | number | boolean);
}

function emitInlineOrBlock(value: YamlValue, indent: number): string {
  // Used after a "- " list marker: render nested map inline on following lines.
  if (isRecord(value)) {
    const body = emitMap(value, indent);
    // First key sits on the dash line; re-indent by trimming leading pad.
    return " " + body.trimStart();
  }
  return emit(value, indent);
}

function emitMap(map: { [key: string]: YamlValue }, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [key, val] of Object.entries(map)) {
    if (val === undefined) continue;
    lines.push(`${pad}${key}:${emit(val, indent + 1)}`);
  }
  return lines.join("\n");
}

export function toYaml(map: { [key: string]: YamlValue }): string {
  return emitMap(map, 0);
}

/** Wrap a markdown body with a YAML frontmatter block. */
export function withFrontmatter(
  frontmatter: { [key: string]: YamlValue },
  body: string,
): string {
  return `---\n${toYaml(frontmatter)}\n---\n\n${body.trimEnd()}\n`;
}
