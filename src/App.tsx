import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Snippet } from "./types";
import { BindEditor } from "./components/BindEditor";
import { HotkeyBadges } from "./components/KeyBadge";
import { hotkeyDisplay } from "./utils/hotkey";

export default function App() {
  const [snippets, setSnippets]   = useState<Snippet[]>([]);
  const [editing, setEditing]     = useState<Snippet | null | "new">(undefined as unknown as null);
  const [isOpen, setIsOpen]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; download: () => Promise<void> } | null>(null);
  const [updating, setUpdating]   = useState(false);

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

  useEffect(() => { load(); }, [load]);

  // Check for updates on startup (silently ignore errors in dev/browser)
  useEffect(() => {
    check().then((update) => {
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
    }).catch(() => {});
  }, []);

  const openNew  = () => { setEditing(null); setIsOpen(true); };
  const openEdit = (s: Snippet) => { setEditing(s); setIsOpen(true); };
  const closeEditor = () => { setIsOpen(false); setEditing(undefined as unknown as null); };

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
    <div className="flex flex-col h-screen bg-ph-bg text-ph-text font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-ph-text">
            SnippetPad
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-ph-elevated text-ph-muted border border-white/8">
            v0.1
          </span>
        </div>

        <div className="flex items-center gap-3">
          {snippets.length > 0 && (
            <span className="text-xs text-ph-faint">
              {snippets.length} {snippets.length === 1 ? "бинд" : snippets.length < 5 ? "бинда" : "биндов"}
            </span>
          )}
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ph-accent hover:bg-ph-accent-hover
                       text-white text-sm font-semibold transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Новый бинд
          </button>
        </div>
      </header>

      {/* Update banner */}
      {updateInfo && (
        <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-ph-accent-subtle border border-ph-accent/40 flex items-center justify-between">
          <span className="text-ph-text text-sm">
            Доступна версия <span className="font-semibold text-ph-accent">{updateInfo.version}</span>
          </span>
          <button
            onClick={updateInfo.download}
            disabled={updating}
            className="px-4 py-1.5 rounded-md bg-ph-accent hover:bg-ph-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {updating ? "Устанавливаю…" : "Обновить"}
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-ph-danger/10 border border-ph-danger/30 flex items-center justify-between">
          <span className="text-ph-danger text-sm">{error}</span>
          <button onClick={() => setError("")} className="text-ph-danger/60 hover:text-ph-danger text-lg">×</button>
        </div>
      )}

      {/* Body */}
      <main className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-ph-faint text-sm">
            Загрузка…
          </div>
        ) : snippets.length === 0 ? (
          <EmptyState onAdd={openNew} />
        ) : (
          <SnippetTable
            snippets={snippets}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </main>

      {/* Footer hint */}
      <footer className="px-6 py-2.5 border-t border-white/8 shrink-0">
        <p className="text-xs text-ph-faint">
          Двойной клик по строке — редактировать · Хоткеи работают глобально, когда приложение свёрнуто
        </p>
      </footer>

      {/* Editor modal */}
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

/* ── Sub-components ── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-72 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-ph-elevated border border-white/8 flex items-center justify-center text-3xl">
        ⌨️
      </div>
      <div>
        <p className="text-ph-text font-semibold mb-1">Нет биндов</p>
        <p className="text-ph-faint text-sm max-w-xs">
          Добавь первый сниппет — назначь хоткей и текст, который будет вставляться при нажатии
        </p>
      </div>
      <button
        onClick={onAdd}
        className="px-5 py-2 rounded-lg bg-ph-accent hover:bg-ph-accent-hover text-white text-sm font-semibold transition-colors"
      >
        + Добавить первый бинд
      </button>
    </div>
  );
}

interface TableProps {
  snippets: Snippet[];
  onEdit: (s: Snippet) => void;
  onDelete: (id: string) => void;
}

function SnippetTable({ snippets, onEdit, onDelete }: TableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const confirmDelete = (id: string) => {
    if (deletingId === id) {
      onDelete(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 2500);
    }
  };

  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[200px_160px_1fr_100px] bg-ph-elevated border-b border-white/8">
        {["Комбо", "Команда", "Текст", ""].map((h) => (
          <div key={h} className="px-4 py-2.5 text-[11px] font-semibold text-ph-faint uppercase tracking-wider">
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {snippets.map((s, i) => {
        const { modifier, key } = hotkeyDisplay(s.hotkey);
        const preview = s.text.replace(/\r?\n/g, " ⏎ ").slice(0, 100);
        const isLast  = i === snippets.length - 1;

        return (
          <div
            key={s.id}
            onDoubleClick={() => onEdit(s)}
            className={`grid grid-cols-[200px_160px_1fr_100px] items-center
                        hover:bg-ph-surface/60 transition-colors cursor-pointer group
                        ${!isLast ? "border-b border-white/6" : ""}`}
          >
            {/* Hotkey badges */}
            <div className="px-4 py-3">
              <HotkeyBadges modifier={modifier} keyName={key} size="sm" />
            </div>

            {/* Command */}
            <div className="px-4 py-3">
              {s.command ? (
                <span className="font-mono text-xs text-ph-muted bg-ph-elevated px-2 py-0.5 rounded border border-white/8">
                  /{s.command}
                </span>
              ) : (
                <span className="text-ph-faint text-xs">—</span>
              )}
            </div>

            {/* Text preview */}
            <div className="px-4 py-3 text-sm text-ph-muted truncate" title={s.text}>
              {preview}
              {s.text.length > 100 && "…"}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                className="p-1.5 rounded-md text-ph-muted hover:text-ph-text hover:bg-ph-elevated transition-colors"
                title="Редактировать"
              >
                <EditIcon />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); confirmDelete(s.id); }}
                className={`p-1.5 rounded-md transition-colors ${
                  deletingId === s.id
                    ? "text-white bg-ph-danger"
                    : "text-ph-muted hover:text-ph-danger hover:bg-ph-danger/10"
                }`}
                title={deletingId === s.id ? "Нажми ещё раз для подтверждения" : "Удалить"}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}
