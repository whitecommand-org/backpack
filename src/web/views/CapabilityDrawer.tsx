import { api, type CapabilitySummary } from "../api.ts";
import { useAsync } from "../hooks.ts";
import { Badge, Button, Spinner, ErrorNote } from "../components.tsx";

export function CapabilityDrawer({
  dir,
  summary,
  onClose,
  onEdit,
  onDeleted,
}: {
  dir: string;
  summary: CapabilitySummary;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { data, loading, error } = useAsync(
    () => api.getCapability(dir, summary.kind, summary.id),
    [dir, summary.kind, summary.id],
  );
  const readOnly = summary.kind === "tools";

  async function remove() {
    if (!confirm(`Delete ${summary.kind}/${summary.id}?`)) return;
    await api.removeCapability(dir, summary.kind, summary.id);
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0a0a0a] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge>{summary.kind}</Badge>
            <h3 className="mt-2 font-mono text-lg text-white">{summary.id}</h3>
            <p className="text-sm text-white/50">{summary.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white">✕</button>
        </div>

        <p className="mt-4 text-sm text-white/70">{summary.description}</p>
        <p className="mt-2 font-mono text-xs text-white/40">{summary.detail}</p>

        <div className="mt-6">
          {loading && <Spinner />}
          {error && <ErrorNote error={error} />}
          {data && (
            <dl className="divide-y divide-white/5 rounded-xl border border-white/10">
              {Object.entries(data.fields).map(([key, value]) => (
                <div key={key} className="flex gap-4 px-4 py-2.5">
                  <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wider text-white/40">{key}</dt>
                  <dd className="min-w-0 break-words font-mono text-xs text-white/80">{render(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          {readOnly ? (
            <Badge className="border-amber-300/30 text-amber-300/80">read-only</Badge>
          ) : (
            <>
              <Button variant="secondary" onClick={onEdit}>Edit</Button>
              <Button variant="danger" onClick={remove}>Delete</Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function render(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
