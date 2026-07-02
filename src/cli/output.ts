import type {
  Overview,
  CapabilitySummary,
  CapabilityDetail,
  ImportSummary,
  ExportSummary,
  TargetInfo,
  CapabilityKind,
} from "../application/index.ts";
import { CAPABILITY_KINDS } from "../application/index.ts";
import type { Diagnostic } from "../core/index.ts";

/** Abstracts stdout/stderr/stdin so `run()` stays pure and testable. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
  readStdin(): Promise<string>;
}

export const realIo: CliIO = {
  out: (text) => process.stdout.write(text + "\n"),
  err: (text) => process.stderr.write(text + "\n"),
  readStdin: () => Bun.stdin.text(),
};

/** Left-align columns separated by two spaces. */
function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd())
    .join("\n");
}

export function formatOverview(o: Overview): string {
  const lines = [`total: ${o.total}`];
  for (const kind of CAPABILITY_KINDS) {
    lines.push(`  ${kind.padEnd(11)} ${o.byKind[kind]}`);
  }
  return lines.join("\n");
}

export function formatList(items: CapabilitySummary[]): string {
  if (items.length === 0) return "(no capabilities)";
  return table(items.map((c) => [c.kind, c.id, c.detail]));
}

export function formatDetail(d: CapabilityDetail): string {
  const lines = [
    `${d.kind}/${d.id}  ${d.name}`,
    `  ${d.description}`,
    `  detail: ${d.detail}`,
  ];
  for (const [key, value] of Object.entries(d.fields)) {
    lines.push(`  ${key}: ${render(value)}`);
  }
  return lines.join("\n");
}

export function formatImport(r: ImportSummary): string {
  const counts = Object.entries(r.imported)
    .map(([kind, n]) => `${kind}=${n}`)
    .join(" ");
  return [`imported: ${counts}`, ...diagnosticLines(r.diagnostics)].join("\n");
}

export function formatExport(r: ExportSummary): string {
  const head = r.written
    ? `wrote ${r.written.length} file(s):\n` + r.written.map((p) => `  ${p}`).join("\n")
    : `${r.files.length} file(s) generated for ${r.target}:\n` +
      r.files.map((f) => `  ${f.path}`).join("\n");
  return [head, ...diagnosticLines(r.diagnostics)].join("\n");
}

export function formatTargets(targets: TargetInfo[]): string {
  return targets
    .map((t) => {
      const kinds = CAPABILITY_KINDS.filter(
        (k) => t.supports[k as keyof typeof t.supports] === true,
      ) as CapabilityKind[];
      return `${t.id} (${t.displayName}): ${kinds.join(", ")}`;
    })
    .join("\n");
}

function diagnosticLines(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => `  ${d.level}: [${d.capabilityId}] ${d.message}`);
}

function render(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
