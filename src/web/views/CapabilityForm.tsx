import { useState, useEffect } from "react";
import { api, type CapabilityKind } from "../api.ts";
import { ApiError } from "../api.ts";
import { Modal, Button, Field, Input, Textarea, Select } from "../components.tsx";

const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PreCompact",
  "PostCompact",
  "SubagentStart",
  "SubagentStop",
];

type Fields = Record<string, string>;

const KIND_LABEL: Record<CapabilityKind, string> = {
  mcpServers: "MCP server",
  agents: "Agent",
  hooks: "Hook",
  skills: "Skill",
  commands: "Command",
  tools: "Tool",
};

export function CapabilityForm({
  dir,
  kind,
  editId,
  onClose,
  onSaved,
}: {
  dir: string;
  kind: CapabilityKind;
  editId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Fields>({ transport: "stdio" });
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const set = (key: string) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  useEffect(() => {
    if (!editId) return;
    api
      .getRawCapability(dir, kind, editId)
      .then((raw) => setF(rawToFields(kind, raw)))
      .catch((err) => setError(err as Error));
  }, [dir, kind, editId]);

  function toggleJson() {
    if (!jsonMode) setJsonText(JSON.stringify(fieldsToBody(kind, f), null, 2));
    setJsonMode((m) => !m);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = jsonMode ? JSON.parse(jsonText) : fieldsToBody(kind, f);
      if (editId) await api.updateCapability(dir, kind, editId, body);
      else await api.createCapability(dir, kind, body);
      onSaved();
    } catch (err) {
      setError(err as Error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${editId ? "Edit" : "New"} ${KIND_LABEL[kind]}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!jsonMode ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="id">
                <Input value={f.id ?? ""} onChange={set("id")} disabled={!!editId} placeholder="my-id" />
              </Field>
              <Field label="name">
                <Input value={f.name ?? ""} onChange={set("name")} placeholder="Display name" />
              </Field>
            </div>
            <Field label="description">
              <Input value={f.description ?? ""} onChange={set("description")} placeholder="What it does" />
            </Field>
            <KindFields kind={kind} f={f} set={set} setF={setF} />
          </>
        ) : (
          <Field label="capability JSON" hint="The exact request body sent to the API.">
            <Textarea rows={14} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
          </Field>
        )}

        {error && <FormError error={error} />}

        <div className="mt-1 flex items-center justify-between">
          <button onClick={toggleJson} className="text-xs text-white/50 hover:text-white/80">
            {jsonMode ? "◂ Back to form" : "Advanced JSON ▸"}
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function KindFields({
  kind,
  f,
  set,
  setF,
}: {
  kind: CapabilityKind;
  f: Fields;
  set: (k: string) => (e: { target: { value: string } }) => void;
  setF: (fn: (prev: Fields) => Fields) => void;
}) {
  switch (kind) {
    case "mcpServers":
      return (
        <>
          <Field label="transport">
            <div className="flex gap-2">
              {["stdio", "http"].map((t) => (
                <button
                  key={t}
                  onClick={() => setF((p) => ({ ...p, transport: t }))}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    (f.transport ?? "stdio") === t
                      ? "border-white/40 bg-white/10"
                      : "border-white/15 text-white/60"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          {(f.transport ?? "stdio") === "stdio" ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="command"><Input value={f.mcpCommand ?? ""} onChange={set("mcpCommand")} placeholder="npx" /></Field>
              <Field label="args" hint="space-separated"><Input value={f.mcpArgs ?? ""} onChange={set("mcpArgs")} placeholder="-y pg-mcp" /></Field>
            </div>
          ) : (
            <Field label="url"><Input value={f.mcpUrl ?? ""} onChange={set("mcpUrl")} placeholder="https://mcp.example.com/mcp" /></Field>
          )}
        </>
      );
    case "agents":
      return (
        <>
          <Field label="system prompt"><Textarea rows={4} value={f.systemPrompt ?? ""} onChange={set("systemPrompt")} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="model" hint="optional"><Input value={f.model ?? ""} onChange={set("model")} placeholder="sonnet" /></Field>
            <Field label="tools" hint="comma-separated, optional"><Input value={f.tools ?? ""} onChange={set("tools")} placeholder="Read, Grep" /></Field>
          </div>
        </>
      );
    case "hooks":
      return (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="event">
              <Select value={f.event ?? "PreToolUse"} onChange={set("event")}>
                {HOOK_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </Select>
            </Field>
            <Field label="matcher" hint="optional tool pattern"><Input value={f.matcher ?? ""} onChange={set("matcher")} placeholder="Bash" /></Field>
          </div>
          <Field label="command"><Input value={f.hookCommand ?? ""} onChange={set("hookCommand")} placeholder="./hooks/guard.sh" /></Field>
        </>
      );
    case "skills":
      return <Field label="body"><Textarea rows={6} value={f.body ?? ""} onChange={set("body")} /></Field>;
    case "commands":
      return (
        <>
          <Field label="body" hint="use $1, $ARGUMENTS"><Textarea rows={5} value={f.body ?? ""} onChange={set("body")} /></Field>
          <Field label="arguments" hint="comma-separated names, optional"><Input value={f.cmdArgs ?? ""} onChange={set("cmdArgs")} placeholder="issue, branch" /></Field>
        </>
      );
    default:
      return null;
  }
}

function FormError({ error }: { error: ApiError | Error }) {
  const issues =
    error instanceof ApiError && Array.isArray(error.details)
      ? (error.details as { path?: (string | number)[]; message: string }[])
      : null;
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-300">
      <div>{error.message}</div>
      {issues && (
        <ul className="mt-1 space-y-0.5 font-mono text-xs text-red-300/80">
          {issues.map((i, n) => (
            <li key={n}>• {(i.path ?? []).join(".") || "(root)"}: {i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function splitList(value?: string): string[] {
  return (value ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function base(f: Fields) {
  return {
    id: (f.id ?? "").trim(),
    name: (f.name || f.id || "").trim(),
    description: (f.description || f.id || "").trim(),
  };
}

function fieldsToBody(kind: CapabilityKind, f: Fields): Record<string, unknown> {
  switch (kind) {
    case "mcpServers":
      return {
        ...base(f),
        connection:
          (f.transport ?? "stdio") === "stdio"
            ? { type: "stdio", command: f.mcpCommand ?? "", args: splitList(f.mcpArgs) }
            : { type: "http", url: f.mcpUrl ?? "" },
      };
    case "agents":
      return {
        ...base(f),
        systemPrompt: f.systemPrompt ?? "",
        ...(f.model ? { model: f.model } : {}),
        ...(f.tools ? { tools: splitList(f.tools) } : {}),
      };
    case "hooks":
      return {
        ...base(f),
        event: f.event ?? "PreToolUse",
        ...(f.matcher ? { matcher: f.matcher } : {}),
        handler: { type: "command", command: f.hookCommand ?? "" },
      };
    case "skills":
      return { ...base(f), body: f.body ?? "" };
    case "commands":
      return {
        ...base(f),
        body: f.body ?? "",
        ...(f.cmdArgs ? { arguments: splitList(f.cmdArgs).map((name) => ({ name })) } : {}),
      };
    default:
      return base(f);
  }
}

function rawToFields(kind: CapabilityKind, raw: Record<string, unknown>): Fields {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const f: Fields = { id: s(raw.id), name: s(raw.name), description: s(raw.description) };
  const conn = (raw.connection ?? {}) as Record<string, unknown>;
  const handler = (raw.handler ?? {}) as Record<string, unknown>;
  switch (kind) {
    case "mcpServers":
      f.transport = s(conn.type) || "stdio";
      f.mcpCommand = s(conn.command);
      f.mcpArgs = Array.isArray(conn.args) ? conn.args.join(" ") : "";
      f.mcpUrl = s(conn.url);
      break;
    case "agents":
      f.systemPrompt = s(raw.systemPrompt);
      f.model = s(raw.model);
      f.tools = Array.isArray(raw.tools) ? raw.tools.join(", ") : "";
      break;
    case "hooks":
      f.event = s(raw.event);
      f.matcher = s(raw.matcher);
      f.hookCommand = s(handler.command);
      break;
    case "skills":
      f.body = s(raw.body);
      break;
    case "commands":
      f.body = s(raw.body);
      f.cmdArgs = Array.isArray(raw.arguments)
        ? (raw.arguments as { name: string }[]).map((a) => a.name).join(", ")
        : "";
      break;
  }
  return f;
}
