import { useState } from "react";
import {
  CalendarDays,
  Copy,
  Download,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import type { Workspace } from "../shared/types";
import { api, del, post } from "./api";
import { Modal } from "./components";
import { today } from "../shared/domain";
import { copyText, download, errorText } from "./format";

const MAX_BACKUP = 2_000_000;

export function WorkspacePanel({
  workspace,
  onClose,
  onWorkspace,
  onStartPersonal,
  onNotify,
}: {
  workspace: Workspace;
  onClose: () => void;
  onWorkspace: (ws: Workspace) => void;
  onStartPersonal: () => Promise<void>;
  onNotify: (s: string) => void;
}) {
  return (
    <Modal title="Workspace" onClose={onClose} wide>
      <div className="modal-body settings">
        <ModeSection workspace={workspace} onStartPersonal={onStartPersonal} />
        <BackupSection workspace={workspace} onWorkspace={onWorkspace} onNotify={onNotify} />
        <RecoverySection onWorkspace={onWorkspace} onNotify={onNotify} />
        <CalendarSection onNotify={onNotify} />
        <DataFlow />
        <DeleteSection workspace={workspace} />
      </div>
    </Modal>
  );
}

function useTask() {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const run = async (name: string, task: () => Promise<void>) => {
    setBusy(name);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

const Err = ({ error }: { error: string }) =>
  error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;

function ModeSection({
  workspace,
  onStartPersonal,
}: {
  workspace: Workspace;
  onStartPersonal: () => Promise<void>;
}) {
  const { busy, error, run } = useTask();
  const demo = workspace.mode === "demo";
  return (
    <section className="settings-section">
      <h3>{demo ? "Demo workspace" : "Personal workspace"}</h3>
      <p className="muted">
        {demo
          ? "Sample subscriptions and illustrative prices for a tour. Your own data is never mixed into demo estimates."
          : "Only subscriptions you added or imported. Savings count only confirmed prices and changes you record."}
      </p>
      {demo ? (
        <button
          className="button primary compact"
          disabled={busy !== null}
          onClick={() => void run("personal", onStartPersonal)}
        >
          {busy && <Loader2 className="spin" size={15} />}
          Start my personal workspace
        </button>
      ) : (
        <p className="small-note">
          To tour the samples again, delete this workspace below. A new demo
          workspace opens.
        </p>
      )}
      <Err error={error} />
    </section>
  );
}

function BackupSection({
  workspace,
  onWorkspace,
  onNotify,
}: {
  workspace: Workspace;
  onWorkspace: (ws: Workspace) => void;
  onNotify: (s: string) => void;
}) {
  const { busy, error, run } = useTask();
  const [pending, setPending] = useState<{
    name: string;
    backup: { format?: string; version?: number; workspace?: Workspace };
  } | null>(null),
    [confirm, setConfirm] = useState(false),
    [readError, setReadError] = useState("");
  const running = workspace.actions.some((a) => a.status === "running");
  const incoming = pending?.backup.workspace;
  return (
    <section className="settings-section">
      <h3>Backup</h3>
      <p className="muted">
        A JSON file with subscriptions, evidence, research, recorded changes and
        dismissals. No credentials, browser sessions, codes or calendar links.
      </p>
      <div className="inline-actions">
        <button
          className="button secondary compact"
          disabled={busy !== null}
          onClick={() =>
            void run("export", async () => {
              const data = await api("/api/workspace/export");
              download(
                `folio-backup-${today()}.json`,
                JSON.stringify(data, null, 2),
                "application/json",
              );
              onNotify("Backup downloaded.");
            })
          }
        >
          <Download size={15} />
          Download backup
        </button>
        <label className="button secondary compact file-button">
          <Upload size={15} />
          Restore from file
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              setReadError("");
              setPending(null);
              setConfirm(false);
              if (!f) return;
              if (f.size > MAX_BACKUP) {
                setReadError("That file is over 2 MB, the backup limit.");
                return;
              }
              try {
                const backup = JSON.parse(await f.text());
                if (backup?.format !== "folio" || !backup.workspace)
                  throw new Error();
                setPending({ name: f.name, backup });
              } catch {
                setReadError("That file isn’t a Folio backup.");
              }
            }}
          />
        </label>
      </div>
      {pending && (
        <div className="notice warning restore-confirm">
          <div>
            <p>
              <strong>{pending.name}</strong> ·{" "}
              {incoming?.subscriptions?.length ?? 0} subscriptions ·{" "}
              {incoming?.mode === "personal" ? "Personal" : "Demo"} · version{" "}
              {pending.backup.version ?? "?"}
            </p>
            <p>
              Restoring replaces everything in this workspace. Restored test
              actions become history and can’t be run. Your recovery code and
              calendar link stop working; create new ones afterwards.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              Replace this workspace with the backup
            </label>
            <div className="inline-actions">
              <button
                className="button primary compact"
                disabled={!confirm || busy !== null || running}
                title={running ? "Wait for the running test to finish" : undefined}
                onClick={() =>
                  void run("import", async () => {
                    onWorkspace(
                      await post<Workspace>("/api/workspace/import", {
                        backup: pending.backup,
                        confirmReplace: true,
                      }),
                    );
                    setPending(null);
                    onNotify(
                      "Backup restored. Create a new recovery code and calendar link if you used them.",
                    );
                  })
                }
              >
                {busy === "import" && <Loader2 className="spin" size={15} />}
                Restore
              </button>
              <button className="text-button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <Err error={readError || error} />
    </section>
  );
}

function RecoverySection({
  onWorkspace,
  onNotify,
}: {
  onWorkspace: (ws: Workspace) => void;
  onNotify: (s: string) => void;
}) {
  const { busy, error, run } = useTask();
  const [code, setCode] = useState(""),
    [restoreCode, setRestoreCode] = useState(""),
    [confirm, setConfirm] = useState(false),
    [restoring, setRestoring] = useState(false);
  const normalized = restoreCode.replace(/[\s-]/g, "").toLowerCase();
  return (
    <section className="settings-section">
      <h3>Recovery code</h3>
      <p className="muted">
        Opens this workspace on another browser. Shown once; a new code
        replaces the old one.
      </p>
      {code ? (
        <div className="secret-box" role="status">
          <code>{code}</code>
          <div className="inline-actions">
            <button
              className="button secondary compact"
              onClick={async () =>
                onNotify((await copyText(code)) ? "Code copied." : "Copy failed. Select the code instead.")
              }
            >
              <Copy size={14} /> Copy
            </button>
            <button
              className="button secondary compact"
              onClick={() =>
                download("folio-recovery-code.txt", `${code}\n`, "text/plain")
              }
            >
              <Download size={14} /> Save as file
            </button>
            <button className="text-button" onClick={() => setCode("")}>
              I saved it
            </button>
          </div>
          <small>Keep it private. Anyone with this code can open your workspace.</small>
        </div>
      ) : (
        <div className="inline-actions">
          <button
            className="button secondary compact"
            disabled={busy !== null}
            onClick={() =>
              void run("code", async () => {
                setCode((await post<{ code: string }>("/api/workspace/recovery")).code);
              })
            }
          >
            <KeyRound size={15} />
            Create recovery code
          </button>
          <button
            className="text-button"
            disabled={busy !== null}
            onClick={() =>
              void run("revoke", async () => {
                await del("/api/workspace/recovery");
                onNotify("Recovery code turned off.");
              })
            }
          >
            Turn off code
          </button>
          <button className="text-button" onClick={() => setRestoring(!restoring)}>
            I have a code
          </button>
        </div>
      )}
      {restoring && !code && (
        <form
          className="restore-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run("restore", async () => {
              onWorkspace(
                await post<Workspace>("/api/workspace/restore", {
                  code: normalized,
                  confirmReplace: true,
                }),
              );
              setRestoreCode("");
              setRestoring(false);
              onNotify("Workspace opened from your recovery code.");
            });
          }}
        >
          <label>
            Recovery code
            <input
              value={restoreCode}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setRestoreCode(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Switch this browser to that workspace. You can return to the
            current one only with its own recovery code.
          </label>
          <button
            className="button primary compact"
            disabled={!confirm || !/^[a-f0-9]{64}$/.test(normalized) || busy !== null}
          >
            {busy === "restore" && <Loader2 className="spin" size={15} />}
            Open workspace
          </button>
        </form>
      )}
      <Err error={error} />
    </section>
  );
}

function CalendarSection({ onNotify }: { onNotify: (s: string) => void }) {
  const { busy, error, run } = useTask();
  const [url, setUrl] = useState("");
  return (
    <section className="settings-section">
      <h3>Renewal calendar</h3>
      <p className="muted">
        A private calendar link with names, amounts and renewal dates only.
        Creating a new link turns off the previous one.
      </p>
      {url && (
        <div className="secret-box" role="status">
          <code>{url}</code>
          <div className="inline-actions">
            <button
              className="button secondary compact"
              onClick={async () =>
                onNotify((await copyText(url)) ? "Link copied." : "Copy failed. Select the link instead.")
              }
            >
              <Copy size={14} /> Copy link
            </button>
            <a className="button secondary compact" href={url} download="folio-renewals.ics">
              <Download size={14} /> Download .ics
            </a>
          </div>
          <small>Anyone with the link can see these renewals until you turn it off.</small>
        </div>
      )}
      <div className="inline-actions">
        <button
          className="button secondary compact"
          disabled={busy !== null}
          onClick={() =>
            void run("create", async () => {
              setUrl((await post<{ url: string }>("/api/workspace/calendar")).url);
            })
          }
        >
          <CalendarDays size={15} />
          {url ? "Create a new link" : "Create calendar link"}
        </button>
        <button
          className="text-button"
          disabled={busy !== null}
          onClick={() =>
            void run("revoke", async () => {
              await del("/api/workspace/calendar");
              setUrl("");
              onNotify("Calendar link turned off.");
            })
          }
        >
          Turn off link
        </button>
      </div>
      <Err error={error} />
    </section>
  );
}

function DataFlow() {
  return (
    <section className="settings-section">
      <h3>
        <ShieldCheck size={17} /> Where your data goes
      </h3>
      <ul className="data-flow">
        <li>
          <strong>Neon</strong> stores this workspace and short-lived sessions.
        </li>
        <li>
          <strong>Neon AI Gateway</strong> reads receipts, confirmation text,
          research results and chat when you use them.
        </li>
        <li>
          <strong>Exa</strong> receives a service and plan name when you ask
          for research.
        </li>
        <li>
          <strong>Kernel</strong> hosts the cloud browsers for account reading
          and controlled tests.
        </li>
      </ul>
    </section>
  );
}

function DeleteSection({ workspace }: { workspace: Workspace }) {
  const { busy, error, run } = useTask();
  const [typed, setTyped] = useState("");
  const running = workspace.actions.some((a) => a.status === "running");
  return (
    <section className="settings-section danger-zone">
      <h3>Delete workspace</h3>
      <p className="muted">
        Removes subscriptions, evidence, codes, calendar link, test merchant
        records and open browser sessions. This can’t be undone.
      </p>
      <label>
        Type <strong>delete</strong> to confirm
        <input
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      <button
        className="button danger compact"
        disabled={typed.trim().toLowerCase() !== "delete" || busy !== null || running}
        onClick={() =>
          void run("delete", async () => {
            await del("/api/workspace", { confirm: true });
            window.location.assign("/");
          })
        }
      >
        {busy ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
        Delete everything
      </button>
      {running && (
        <p className="small-note">Wait for the running test to finish first.</p>
      )}
      <Err error={error} />
    </section>
  );
}
