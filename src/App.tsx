import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Snippet } from "./types";
import { BindEditor } from "./components/BindEditor";
import { HotkeyBadges } from "./components/KeyBadge";
import { hotkeyDisplay } from "./utils/hotkey";

const APP_NAME = "Customer Support Binder";
const APP_VERSION = "1.0";
const FOOTER_CREDIT = "by Zhdanov for Mail IQ";

function bindLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return "бинд";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "бинда";
  return "биндов";
}

export default function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [editing, setEditing] = useState<Snippet | null | "new">(undefined as unknown as null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; download: () => Promise<void> } | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await invoke<Snippet[]>("get_snippets");
      setSnippets(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    check()
      .then((update) => {
        if (update?.available) {
          setUpdateInfo({
            version: update.version,
            download: async () => {
              setUpdating(true);
              await update.downloadAndInstall();
              await relaunch();
            },
          });
        }
      })
      .catch(() => {});
  }, []);

  const openNew = () => {
    setEditing(null);
    setIsOpen(true);
  };

  const openEdit = (s: Snippet) => {
    setEditing(s);
    setIsOpen(true);
  };

  const closeEditor = () => {
    setIsOpen(false);
    setEditing(undefined as unknown as null);
  };

  const handleSave = async (s: Snippet) => {
    try {
      await invoke("save_snippet", { snippet: s });
      await load();
      closeEditor();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_snippet", { id });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const existingHotkeys = snippets.map((s) => s.hotkey);

  return (
    <div className="flex h-screen flex-col bg-ph-bg font-sans text-ph-text">
      <header className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-ph-text">{APP_NAME}</span>
          <span className="rounded border border-white/8 bg-ph-elevated px-2 py-0.5 font-mono text-[10px] text-ph-muted">
            v{APP_VERSION}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {snippets.length > 0 && (
            <span className="text-xs text-ph-faint">
              {snippets.length} {bindLabel(snippets.length)}
            </span>
          )}
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-ph-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ph-accent-hover"
          >
            <span className="text-base leading-none">+</span>
            Новый бинд
          </button>
        </div>
      </header>

      {updateInfo && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-ph-accent/40 bg-ph-accent-subtle px-4 py-2.5">
          <span className="text-sm text-ph-text">
            Доступна версия <span className="font-semibold text-ph-accent">{updateInfo.version}</span>
          </span>
          <button
            onClick={updateInfo.download}
            disabled={updating}
            className="rounded-md bg-ph-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-ph-accent-hover disabled:opacity-60"
          >
            {updating ? "Устанавливаю…" : "Обновить"}
          </button>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-ph-danger/30 bg-ph-danger/10 px-4 py-2.5">
          <span className="text-sm text-ph-danger">{error}</span>
          <button onClick={() => setError("")} className="text-lg text-ph-danger/60 transition-colors hover:text-ph-danger">
            ×
          </button>
        </div>
      )}

      <main className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-ph-faint">Загрузка…</div>
        ) : snippets.length === 0 ? (
          <EmptyState onAdd={openNew} />
        ) : (
          <SnippetTable snippets={snippets} onEdit={openEdit} onDelete={handleDelete} />
        )}
      </main>

      <footer className="shrink-0 border-t border-white/8 px-6 py-2.5">
        <div className="flex items-center justify-between gap-4 text-xs text-ph-faint">
          <p>Двойной клик по строке — редактировать · Хоткеи работают глобально, когда приложение свёрнуто</p>
          <p className="shrink-0 text-right">{FOOTER_CREDIT}</p>
        </div>
      </footer>

      {isOpen && (
        <BindEditor
          snippet={editing === "new" ? null : editing}
          existingHotkeys={existingHotkeys}
          onSave={handleSave}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-ph-elevated text-3xl">
        ⌨️
      </div>
      <div>
        <p className="mb-1 font-semibold text-ph-text">Нет биндов</p>
        <p className="max-w-xs text-sm text-ph-faint">
          Добавь первый шаблон: назначь хоткей и текст, который будет вставляться при нажатии.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="rounded-lg bg-ph-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ph-accent-hover"
      >
        + Добавить первый бинд
      </button>
    </div>
  );
}

interface TableProps {
  snippets: Snippet[];
  onEdit: (s: Snippet) => void;
  onDelete: (id: string) => Promise<void> | void;
}

function SnippetTable({ snippets, onEdit, onDelete }: TableProps) {
  const [pendingDelete, setPendingDelete] = useState<Snippet | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="grid grid-cols-[200px_160px_1fr_100px] border-b border-white/8 bg-ph-elevated">
          {["Комбо", "Команда", "Текст", ""].map((h) => (
            <div key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ph-faint">
              {h}
            </div>
          ))}
        </div>

        {snippets.map((s, i) => {
          const { modifier, key } = hotkeyDisplay(s.hotkey);
          const preview = s.text.replace(/\r?\n/g, " ↩ ").slice(0, 100);
          const isLast = i === snippets.length - 1;

          return (
            <div
              key={s.id}
              onDoubleClick={() => onEdit(s)}
              className={`group grid grid-cols-[200px_160px_1fr_100px] items-center cursor-pointer transition-colors hover:bg-ph-surface/60 ${
                !isLast ? "border-b border-white/6" : ""
              }`}
            >
              <div className="px-4 py-3">
                <HotkeyBadges modifier={modifier} keyName={key} size="sm" />
              </div>

              <div className="px-4 py-3">
                {s.command ? (
                  <span className="rounded border border-white/8 bg-ph-elevated px-2 py-0.5 font-mono text-xs text-ph-muted">
                    /{s.command}
                  </span>
                ) : (
                  <span className="text-xs text-ph-faint">—</span>
                )}
              </div>

              <div className="truncate px-4 py-3 text-sm text-ph-muted" title={s.text}>
                {preview}
                {s.text.length > 100 && "…"}
              </div>

              <div className="flex items-center justify-end gap-2 px-4 py-3 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(s);
                  }}
                  className="rounded-md p-1.5 text-ph-muted transition-colors hover:bg-ph-elevated hover:text-ph-text"
                  title="Редактировать"
                >
                  <EditIcon />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(s);
                  }}
                  className="rounded-md p-1.5 text-ph-muted transition-colors hover:bg-ph-danger/10 hover:text-ph-danger"
                  title="Удалить"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-[360px] max-w-[92vw] rounded-xl border border-white/10 bg-ph-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/8 px-5 pb-3 pt-4">
              <p className="text-sm font-semibold text-ph-text">Точно удалить бинд?</p>
              <p className="mt-1 text-xs text-ph-faint">Действие нельзя отменить из интерфейса.</p>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-ph-elevated px-3 py-3">
                <HotkeyPreview hotkey={pendingDelete.hotkey} />
                <span className="max-w-[170px] truncate text-xs text-ph-muted" title={pendingDelete.text}>
                  {pendingDelete.text.replace(/\r?\n/g, " ↩ ") || "Пустой текст"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg px-4 py-2 text-sm text-ph-muted transition-colors hover:bg-ph-elevated hover:text-ph-text"
              >
                Нет
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-ph-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ph-danger/90"
              >
                Да, удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HotkeyPreview({ hotkey }: { hotkey: string }) {
  const { modifier, key } = hotkeyDisplay(hotkey);
  return <HotkeyBadges modifier={modifier} keyName={key} size="sm" />;
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
