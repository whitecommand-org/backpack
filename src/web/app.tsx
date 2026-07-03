import { useState } from "react";
import type { CapabilityKind } from "./api.ts";
import { Pill, EmptyState } from "./components.tsx";
import { WorkspacesRail } from "./views/Workspaces.tsx";
import { Overview } from "./views/Overview.tsx";
import { Capabilities } from "./views/Capabilities.tsx";
import { Panels } from "./views/Panels.tsx";
import { CapabilityForm } from "./views/CapabilityForm.tsx";

type Tab = "overview" | "capabilities" | "panels";
const TABS: Tab[] = ["overview", "capabilities", "panels"];
const ACTIVE_KEY = "backpack.activeDir";

export function App() {
  const [activeDir, setActiveDir] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY),
  );
  const [tab, setTab] = useState<Tab>("overview");
  const [capKind, setCapKind] = useState<CapabilityKind | undefined>();
  const [quickNew, setQuickNew] = useState(false);
  // Remount capability/overview views after mutations from other tabs.
  const [nonce, setNonce] = useState(0);

  function selectDir(dir: string | null) {
    setActiveDir(dir);
    if (dir) localStorage.setItem(ACTIVE_KEY, dir);
    else localStorage.removeItem(ACTIVE_KEY);
    setTab("overview");
  }

  function openKind(kind: CapabilityKind) {
    setCapKind(kind);
    setTab("capabilities");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold tracking-tight text-white">{">_"}</span>
          <span className="font-mono text-sm uppercase tracking-[0.2em] text-white/80">backpack</span>
        </div>
        {activeDir && <Pill dot>{activeDir}</Pill>}
      </header>

      <div className="grid flex-1 grid-cols-1 gap-8 pb-16 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <WorkspacesRail activeDir={activeDir} onSelect={selectDir} />
        </aside>

        <main className="min-w-0">
          {!activeDir ? (
            <div className="relative">
              <div className="glow pointer-events-none absolute inset-x-0 -top-10 h-40" />
              <EmptyState
                title="Select or add a workspace"
                hint="Point at any project folder — its backpack lives in .backpack/backpack.db"
              />
            </div>
          ) : (
            <>
              <nav className="mb-6 flex gap-1 border-b border-white/10">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`-mb-px border-b-2 px-4 py-2.5 text-sm capitalize transition-colors ${
                      tab === t
                        ? "border-white text-white"
                        : "border-transparent text-white/45 hover:text-white/80"
                    }`}
                  >
                    {t === "panels" ? "Import / Export" : t}
                  </button>
                ))}
              </nav>

              {tab === "overview" && (
                <Overview
                  key={`ov-${activeDir}-${nonce}`}
                  dir={activeDir}
                  onPick={openKind}
                  onNew={() => setQuickNew(true)}
                  onImport={() => setTab("panels")}
                  onExport={() => setTab("panels")}
                />
              )}
              {tab === "capabilities" && (
                <Capabilities key={`cap-${activeDir}-${nonce}`} dir={activeDir} initialKind={capKind} />
              )}
              {tab === "panels" && <Panels dir={activeDir} />}
            </>
          )}
        </main>
      </div>

      {quickNew && activeDir && (
        <CapabilityForm
          dir={activeDir}
          kind="agents"
          onClose={() => setQuickNew(false)}
          onSaved={() => {
            setQuickNew(false);
            setNonce((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
