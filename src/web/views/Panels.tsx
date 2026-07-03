import { useState } from "react";
import { api, type ImportSummary, type ExportSummary, type Diagnostic } from "../api.ts";
import { useAsync } from "../hooks.ts";
import { Card, Button, Terminal, Badge, Spinner } from "../components.tsx";

const IMPORT_TARGETS = ["claude-code", "codex", "copilot-cli"];

export function ImportPanel({ dir }: { dir: string }) {
  const [targets, setTargets] = useState<string[]>(IMPORT_TARGETS);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const toggle = (t: string) =>
    setTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await api.importConfigs(dir, targets));
    } catch (e) {
      setError(e as Error);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">Import</h3>
        <p className="text-sm text-white/50">Read existing tool configs in this folder into the backpack.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {IMPORT_TARGETS.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={`rounded-full border px-3 py-1 font-mono text-xs ${
              targets.includes(t) ? "border-white/40 bg-white/10 text-white" : "border-white/15 text-white/50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div>
        <Button variant="primary" onClick={run} disabled={running || targets.length === 0}>
          {running ? "Importing…" : "Run import"}
        </Button>
      </div>
      {error && <ErrorLine text={error.message} />}
      {result && (
        <Terminal title="import result">
          {`>_ imported ${Object.entries(result.imported).map(([k, n]) => `${k}=${n}`).join("  ")}`}
          {diagnostics(result.diagnostics)}
        </Terminal>
      )}
    </Card>
  );
}

export function ExportPanel({ dir }: { dir: string }) {
  const targets = useAsync(() => api.targets(), []);
  const [target, setTarget] = useState("claude-code");
  const [write, setWrite] = useState(false);
  const [result, setResult] = useState<ExportSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await api.exportTarget(dir, target, write));
    } catch (e) {
      setError(e as Error);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">Export</h3>
        <p className="text-sm text-white/50">Generate a target's native config from the backpack.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {targets.loading && <Spinner />}
        {(targets.data ?? []).map((t) => (
          <button
            key={t.id}
            onClick={() => setTarget(t.id)}
            className={`rounded-full border px-3 py-1 font-mono text-xs ${
              target === t.id ? "border-white/40 bg-white/10 text-white" : "border-white/15 text-white/50"
            }`}
          >
            {t.id}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
          write to folder
        </label>
      </div>
      <div>
        <Button variant="primary" onClick={run} disabled={running}>
          {running ? "Exporting…" : "Run export"}
        </Button>
      </div>
      {error && <ErrorLine text={error.message} />}
      {result && (
        <Terminal title={`export · ${result.target}`}>
          {result.written
            ? `>_ wrote ${result.written.length} file(s)\n` + result.written.map((p) => `  ${p}`).join("\n")
            : `>_ ${result.files.length} file(s)\n` + result.files.map((f) => `  ${f.path}`).join("\n")}
          {diagnostics(result.diagnostics)}
        </Terminal>
      )}
    </Card>
  );
}

function diagnostics(diags: Diagnostic[]): string {
  if (diags.length === 0) return "";
  return "\n" + diags.map((d) => `  ${d.level}: [${d.capabilityId}] ${d.message}`).join("\n");
}

function ErrorLine({ text }: { text: string }) {
  return <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-300">{text}</div>;
}

export function Panels({ dir }: { dir: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Import / Export</h2>
        <Badge>{dir.split("/").pop()}</Badge>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ImportPanel dir={dir} />
        <ExportPanel dir={dir} />
      </div>
    </div>
  );
}
