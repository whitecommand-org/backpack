import { useState, type MouseEvent } from "react";
import { api, type WorkspaceEntry } from "../api.ts";
import { useAsync } from "../hooks.ts";
import { Button, Input, Spinner } from "../components.tsx";

export function WorkspacesRail({
  activeDir,
  onSelect,
}: {
  activeDir: string | null;
  onSelect: (dir: string | null) => void;
}) {
  const { data, loading, error, reload } = useAsync(() => api.listWorkspaces(), []);
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function add() {
    if (!path.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const entry = await api.addWorkspace(path.trim());
      setPath("");
      reload();
      onSelect(entry.dir);
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(entry: WorkspaceEntry, e: MouseEvent) {
    e.stopPropagation();
    await api.removeWorkspace(entry.dir);
    if (activeDir === entry.dir) onSelect(null);
    reload();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-white/40">Workspaces</span>
        {loading && <Spinner />}
      </div>

      <div className="flex flex-col gap-1.5">
        {(data ?? []).map((ws) => (
          <button
            key={ws.dir}
            onClick={() => onSelect(ws.dir)}
            className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
              activeDir === ws.dir
                ? "border-white/25 bg-white/[0.06]"
                : "border-transparent hover:bg-white/[0.03]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white/90">{ws.name}</div>
              <div className="truncate font-mono text-[11px] text-white/35">{ws.dir}</div>
            </div>
            <span className="shrink-0 font-mono text-xs text-white/40">{ws.total}</span>
            <span
              onClick={(e) => remove(ws, e)}
              className="hidden shrink-0 rounded px-1 text-white/30 hover:text-red-300 group-hover:inline"
            >
              ✕
            </span>
          </button>
        ))}
        {data && data.length === 0 && (
          <p className="px-1 py-2 text-xs text-white/35">No workspaces yet. Add a folder below.</p>
        )}
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-white/10 pt-3">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="/path/to/project"
          className="text-xs"
        />
        <Button onClick={add} disabled={adding || !path.trim()}>
          {adding ? "Adding…" : "Add workspace"}
        </Button>
        {addError && <p className="text-xs text-red-300">{addError}</p>}
        {error && <p className="text-xs text-red-300">{error.message}</p>}
      </div>
    </div>
  );
}
