import { useEffect, useRef, useState } from "react";
import { Snippet } from "../types";
import { HotkeyBadges } from "./KeyBadge";
import {
  MODIFIER_DISPLAY,
  MODIFIERS,
  buildHotkey,
  eventModifier,
  isModifierKey,
  normalizeKey,
  parseHotkey,
} from "../utils/hotkey";
import { v4 as uuidv4 } from "uuid";

interface Props {
  snippet: Snippet | null; // null = new
  existingHotkeys: string[];
  onSave: (s: Snippet) => void;
  onClose: () => void;
}

type CaptureMode = "idle" | "capturing";

export function BindEditor({ snippet, existingHotkeys, onSave, onClose }: Props) {
  const isNew = snippet === null;
  const parsed = snippet ? parseHotkey(snippet.hotkey) : { modifier: "", key: "" };

  const [modifier, setModifier] = useState(parsed.modifier);
  const [key, setKey]           = useState(parsed.key);
  const [text, setText]         = useState(snippet?.text ?? "");
  const [command, setCommand]   = useState(snippet?.command ?? "");
  const [capture, setCapture]   = useState<CaptureMode>("idle");
  const [captureHint, setCaptureHint] = useState("");
  const [error, setError]       = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);

  // Global keydown while capturing
  useEffect(() => {
    if (capture !== "capturing") return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setCapture("idle");
        setCaptureHint("");
        return;
      }
      if (isModifierKey(e.key)) return;

      const mod = eventModifier(e);
      if (!mod) {
        setCaptureHint("Нужен модификатор: Ctrl, Alt, Shift или Win");
        return;
      }

      const k = normalizeKey(e.key);
      setModifier(mod);
      setKey(k);
      setCapture("idle");
      setCaptureHint("");
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capture]);

  // Close on Esc when not capturing
  useEffect(() => {
    if (capture === "capturing") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capture, onClose]);

  const handleSave = () => {
    setError("");
    if (!modifier || !key) { setError("Выбери сочетание клавиш"); return; }
    if (!text.trim())       { setError("Заполни текст шаблона");   return; }

    const hotkey = buildHotkey(modifier, key);
    const isDuplicate = existingHotkeys
      .filter((hk) => !snippet || hk !== snippet.hotkey)
      .includes(hotkey);
    if (isDuplicate) { setError("Этот хоткей уже занят"); return; }

    onSave({
      id:      snippet?.id ?? uuidv4(),
      hotkey,
      text,
      command: command.trim().replace(/^\/+/, ""),
    });
  };

  const modDisplay = modifier
    ? (MODIFIER_DISPLAY[modifier as keyof typeof MODIFIER_DISPLAY] ?? modifier)
    : "";

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={overlayRef}
        className="bg-ph-surface border border-white/10 rounded-xl w-[720px] max-w-[95vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-ph-text">
            {isNew ? "Новый бинд" : "Редактировать бинд"}
          </h2>
          <button
            onClick={onClose}
            className="text-ph-faint hover:text-ph-muted transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Hotkey row */}
          <div>
            <label className="block text-xs font-medium text-ph-muted mb-2 uppercase tracking-wider">
              Комбинация клавиш
            </label>

            {capture === "capturing" ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center justify-center h-11 rounded-lg border border-ph-accent bg-ph-accent-subtle text-ph-accent font-mono text-sm animate-pulse">
                  Нажми комбинацию… (Esc — отмена)
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* Modifier select */}
                <select
                  value={modifier}
                  onChange={(e) => setModifier(e.target.value)}
                  className="h-11 px-3 rounded-lg border border-white/10 bg-ph-elevated text-ph-text font-mono text-sm focus:border-ph-accent transition-colors"
                >
                  <option value="">— мод —</option>
                  {MODIFIERS.map((m) => (
                    <option key={m} value={m}>{MODIFIER_DISPLAY[m]}</option>
                  ))}
                </select>

                <span className="text-ph-faint text-lg font-mono">+</span>

                {/* Key display / capture trigger */}
                <button
                  onClick={() => { setCaptureHint(""); setCapture("capturing"); }}
                  className="h-11 px-4 rounded-lg border border-white/10 bg-ph-elevated text-ph-text font-mono text-sm hover:border-ph-accent/60 transition-colors min-w-[80px]"
                >
                  {key || <span className="text-ph-faint">клавиша…</span>}
                </button>

                <span className="text-ph-faint text-sm">или</span>

                <button
                  onClick={() => { setModifier(""); setKey(""); setCaptureHint(""); setCapture("capturing"); }}
                  className="h-11 px-4 rounded-lg border border-white/10 bg-ph-elevated text-ph-muted text-sm hover:border-ph-accent/60 hover:text-ph-text transition-colors"
                >
                  Захватить целиком
                </button>

                {/* Preview */}
                {modifier && key && (
                  <div className="ml-auto">
                    <HotkeyBadges modifier={modDisplay} keyName={key} />
                  </div>
                )}
              </div>
            )}

            {captureHint && (
              <p className="mt-1.5 text-xs text-ph-danger">{captureHint}</p>
            )}
          </div>

          {/* Text */}
          <div>
            <label className="block text-xs font-medium text-ph-muted mb-2 uppercase tracking-wider">
              Текст шаблона
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст для вставки… Поддерживаются эмодзи 🎉 и переносы строк"
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-ph-elevated text-ph-text text-sm
                         placeholder:text-ph-faint font-sans resize-none
                         focus:border-ph-accent/60 transition-colors"
            />
            <p className="mt-1 text-xs text-ph-faint">
              {text.length} символов · Enter = перенос строки
            </p>
          </div>

          {/* Command (optional) */}
          <div>
            <label className="block text-xs font-medium text-ph-muted mb-2 uppercase tracking-wider">
              Команда <span className="normal-case text-ph-faint font-normal">(опционально)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ph-faint font-mono text-sm">/</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value.replace(/^\/+/, ""))}
                placeholder="команда"
                className="w-full pl-6 pr-3 py-2.5 h-11 rounded-lg border border-white/10 bg-ph-elevated text-ph-text text-sm
                           font-mono placeholder:text-ph-faint
                           focus:border-ph-accent/60 transition-colors"
              />
            </div>
            <p className="mt-1 text-xs text-ph-faint">
              Набери /команда в любом поле — текст вставится автоматически
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ph-danger/10 border border-ph-danger/30">
              <span className="text-ph-danger text-xs">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-ph-muted hover:text-ph-text hover:bg-ph-elevated transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-ph-accent hover:bg-ph-accent-hover text-white transition-colors"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
