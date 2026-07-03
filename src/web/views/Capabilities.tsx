import { useState, type ReactNode } from "react";
import {
  api,
  CAPABILITY_KINDS,
  WRITABLE_KINDS,
  type CapabilityKind,
  type CapabilitySummary,
} from "../api.ts";
import { useAsync } from "../hooks.ts";
import {
  Button,
  Badge,
  Input,
  Spinner,
  EmptyState,
  ErrorNote,
} from "../components.tsx";
import { CapabilityForm } from "./CapabilityForm.tsx";
import { CapabilityDrawer } from "./CapabilityDrawer.tsx";

export function Capabilities({
  dir,
  initialKind,
}: {
  dir: string;
  initialKind?: CapabilityKind;
}) {
  const [kind, setKind] = useState<CapabilityKind | undefined>(initialKind);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CapabilitySummary | null>(null);
  const [form, setForm] = useState<{ kind: CapabilityKind; editId?: string } | null>(null);

  const { data, loading, error, reload } = useAsync(
    () => api.listCapabilities(dir, { kind, q: q || undefined }),
    [dir, kind, q],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Capabilities</h2>
        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-48"
          />
          <NewMenu onPick={(k) => setForm({ kind: k })} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={!kind} onClick={() => setKind(undefined)}>all</Chip>
        {CAPABILITY_KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k}</Chip>
        ))}
      </div>

      {loading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && data.length === 0 && (
        <EmptyState title="No capabilities" hint="Create one, or import existing configs." />
      )}
      {data && data.length > 0 && (
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
          {data.map((cap) => (
            <button
              key={`${cap.kind}/${cap.id}`}
              onClick={() => setSelected(cap)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
            >
              <Badge className="shrink-0">{cap.kind}</Badge>
              <span className="w-40 shrink-0 truncate font-mono text-sm text-white/90">{cap.id}</span>
              <span className="truncate text-sm text-white/50">{cap.detail}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <CapabilityDrawer
          dir={dir}
          summary={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setForm({ kind: selected.kind, editId: selected.id });
            setSelected(null);
          }}
          onDeleted={() => {
            setSelected(null);
            reload();
          }}
        />
      )}

      {form && (
        <CapabilityForm
          dir={dir}
          kind={form.kind}
          editId={form.editId}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors ${
        active
          ? "border-white/40 bg-white/10 text-white"
          : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function NewMenu({ onPick }: { onPick: (kind: CapabilityKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="primary" onClick={() => setOpen((o) => !o)}>+ New</Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] py-1 shadow-xl">
            {WRITABLE_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  onPick(k);
                  setOpen(false);
                }}
                className="block w-full px-4 py-2 text-left font-mono text-sm text-white/70 hover:bg-white/5 hover:text-white"
              >
                {k}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
