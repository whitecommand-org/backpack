import { api, CAPABILITY_KINDS, type CapabilityKind } from "../api.ts";
import { useAsync } from "../hooks.ts";
import { StatCard, Button, Spinner, ErrorNote } from "../components.tsx";

export function Overview({
  dir,
  onPick,
  onNew,
  onImport,
  onExport,
}: {
  dir: string;
  onPick: (kind: CapabilityKind) => void;
  onNew: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  const { data, loading, error } = useAsync(() => api.overview(dir), [dir]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Overview</h2>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onNew}>+ New</Button>
          <Button onClick={onImport}>Import</Button>
          <Button onClick={onExport}>Export</Button>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CAPABILITY_KINDS.map((kind) => (
            <StatCard
              key={kind}
              label={kind}
              value={data.byKind[kind]}
              onClick={() => onPick(kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
