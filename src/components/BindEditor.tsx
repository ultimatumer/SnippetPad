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
  snippet: Snippet | null;
  existingHotkeys: string[];
  onSave: (s: Snippet) => void;
  onClose: () => void;
}

type CaptureMode = "idle" | "capturing";

const UI = {
  modifierRequired: "\u041d\u0443\u0436\u0435\u043d \u043c\u043e\u0434\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440: Ctrl, Alt, Shift \u0438\u043b\u0438 Win",
  chooseHotkey: "\u0412\u044b\u0431\u0435\u0440\u0438 \u0441\u043e\u0447\u0435\u0442\u0430\u043d\u0438\u0435 \u043a\u043b\u0430\u0432\u0438\u0448",
  fillTemplate: "\u0417\u0430\u043f\u043e\u043b\u043d\u0438 \u0442\u0435\u043a\u0441\u0442 \u0448\u0430\u0431\u043b\u043e\u043d\u0430",
  duplicateHotkey: "\u042d\u0442\u043e\u0442 \u0445\u043e\u0442\u043a\u0435\u0439 \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442",
  newBind: "\u041d\u043e\u0432\u044b\u0439 \u0431\u0438\u043d\u0434",
  editBind: "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0431\u0438\u043d\u0434",
  hotkeyLabel: "\u041a\u043e\u043c\u0431\u0438\u043d\u0430\u0446\u0438\u044f \u043a\u043b\u0430\u0432\u0438\u0448",
  pressCombo: "\u041d\u0430\u0436\u043c\u0438 \u043a\u043e\u043c\u0431\u0438\u043d\u0430\u0446\u0438\u044e\u2026 (Esc \u2014 \u043e\u0442\u043c\u0435\u043d\u0430)",
  modPlaceholder: "\u2014 \u043c\u043e\u0434 \u2014",
  keyPlaceholder: "\u043a\u043b\u0430\u0432\u0438\u0448\u0430\u2026",
  or: "\u0438\u043b\u0438",
  captureFull: "\u0417\u0430\u0445\u0432\u0430\u0442\u0438\u0442\u044c \u0446\u0435\u043b\u0438\u043a\u043e\u043c",
  textLabel: "\u0422\u0435\u043a\u0441\u0442 \u0448\u0430\u0431\u043b\u043e\u043d\u0430",
  textPlaceholder:
    "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0442\u0435\u043a\u0441\u0442 \u0434\u043b\u044f \u0432\u0441\u0442\u0430\u0432\u043a\u0438\u2026 \u041f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044e\u0442\u0441\u044f \u044d\u043c\u043e\u0434\u0437\u0438 \ud83c\udf89 \u0438 \u043f\u0435\u0440\u0435\u043d\u043e\u0441\u044b \u0441\u0442\u0440\u043e\u043a",
  charsSuffix: "\u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432 \u00b7 Enter = \u043f\u0435\u0440\u0435\u043d\u043e\u0441 \u0441\u0442\u0440\u043e\u043a\u0438",
  commandLabel: "\u041a\u043e\u043c\u0430\u043d\u0434\u0430",
  optional: "(\u043e\u043f\u0446\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u043e)",
  commandPlaceholder: "\u043a\u043e\u043c\u0430\u043d\u0434\u0430",
  commandHint:
    "\u041d\u0430\u0431\u0435\u0440\u0438 /\u043a\u043e\u043c\u0430\u043d\u0434\u0430 \u0432 \u043b\u044e\u0431\u043e\u043c \u043f\u043e\u043b\u0435 \u2014 \u0442\u0435\u043a\u0441\u0442 \u0432\u0441\u0442\u0430\u0432\u0438\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438",
  cancel: "\u041e\u0442\u043c\u0435\u043d\u0430",
  save: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c",
  close: "\u00d7",
} as const;

export function BindEditor({ snippet, existingHotkeys, onSave, onClose }: Props) {
  const isNew = snippet === null;
  const parsed = snippet ? parseHotkey(snippet.hotkey) : { modifier: "", key: "" };

  const [modifier, setModifier] = useState(parsed.modifier);
  const [key, setKey] = useState(parsed.key);
  const [text, setText] = useState(snippet?.text ?? "");
  const [command, setCommand] = useState(snippet?.command ?? "");
  const [capture, setCapture] = useState<CaptureMode>("idle");
  const [captureHint, setCaptureHint] = useState("");
  const [error, setError] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);

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
        setCaptureHint(UI.modifierRequired);
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
    if (!modifier || !key) {
      setError(UI.chooseHotkey);
      return;
    }
    if (!text.trim()) {
      setError(UI.fillTemplate);
      return;
    }

    const hotkey = buildHotkey(modifier, key);
    const isDuplicate = existingHotkeys
      .filter((hk) => !snippet || hk !== snippet.hotkey)
      .includes(hotkey);

    if (isDuplicate) {
      setError(UI.duplicateHotkey);
      return;
    }

    onSave({
      id: snippet?.id ?? uuidv4(),
      hotkey,
      text,
      command: command.trim().replace(/^\/+/, ""),
    });
  };

  const modDisplay = modifier
    ? (MODIFIER_DISPLAY[modifier as keyof typeof MODIFIER_DISPLAY] ?? modifier)
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={overlayRef}
        className="w-[720px] max-w-[95vw] rounded-xl border border-white/10 bg-ph-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-6 pb-4 pt-5">
          <h2 className="text-base font-semibold text-ph-text">{isNew ? UI.newBind : UI.editBind}</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-ph-faint transition-colors hover:text-ph-muted"
          >
            {UI.close}
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ph-muted">
              {UI.hotkeyLabel}
            </label>

            {capture === "capturing" ? (
              <div className="flex items-center gap-3">
                <div className="flex h-11 flex-1 items-center justify-center rounded-lg border border-ph-accent bg-ph-accent-subtle font-mono text-sm text-ph-accent animate-pulse">
                  {UI.pressCombo}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <select
                  value={modifier}
                  onChange={(e) => setModifier(e.target.value)}
                  className="h-11 rounded-lg border border-white/10 bg-ph-elevated px-3 font-mono text-sm text-ph-text transition-colors focus:border-ph-accent"
                >
                  <option value="">{UI.modPlaceholder}</option>
                  {MODIFIERS.map((m) => (
                    <option key={m} value={m}>
                      {MODIFIER_DISPLAY[m]}
                    </option>
                  ))}
                </select>

                <span className="font-mono text-lg text-ph-faint">+</span>

                <button
                  onClick={() => {
                    setCaptureHint("");
                    setCapture("capturing");
                  }}
                  className="h-11 min-w-[80px] rounded-lg border border-white/10 bg-ph-elevated px-4 font-mono text-sm text-ph-text transition-colors hover:border-ph-accent/60"
                >
                  {key || <span className="text-ph-faint">{UI.keyPlaceholder}</span>}
                </button>

                <span className="text-sm text-ph-faint">{UI.or}</span>

                <button
                  onClick={() => {
                    setModifier("");
                    setKey("");
                    setCaptureHint("");
                    setCapture("capturing");
                  }}
                  className="h-11 rounded-lg border border-white/10 bg-ph-elevated px-4 text-sm text-ph-muted transition-colors hover:border-ph-accent/60 hover:text-ph-text"
                >
                  {UI.captureFull}
                </button>

                {modifier && key && (
                  <div className="ml-auto">
                    <HotkeyBadges modifier={modDisplay} keyName={key} />
                  </div>
                )}
              </div>
            )}

            {captureHint && <p className="mt-1.5 text-xs text-ph-danger">{captureHint}</p>}
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ph-muted">
              {UI.textLabel}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={UI.textPlaceholder}
              rows={4}
              className="w-full resize-none rounded-lg border border-white/10 bg-ph-elevated px-3 py-2.5 text-sm text-ph-text placeholder:text-ph-faint transition-colors focus:border-ph-accent/60"
            />
            <p className="mt-1 text-xs text-ph-faint">
              {text.length} {UI.charsSuffix}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ph-muted">
              {UI.commandLabel} <span className="normal-case font-normal text-ph-faint">{UI.optional}</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-ph-faint">/</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value.replace(/^\/+/, ""))}
                placeholder={UI.commandPlaceholder}
                className="h-11 w-full rounded-lg border border-white/10 bg-ph-elevated pl-6 pr-3 py-2.5 font-mono text-sm text-ph-text placeholder:text-ph-faint transition-colors focus:border-ph-accent/60"
              />
            </div>
            <p className="mt-1 text-xs text-ph-faint">{UI.commandHint}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-ph-danger/30 bg-ph-danger/10 px-3 py-2">
              <span className="text-xs text-ph-danger">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/8 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ph-muted transition-colors hover:bg-ph-elevated hover:text-ph-text"
          >
            {UI.cancel}
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-ph-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ph-accent-hover"
          >
            {UI.save}
          </button>
        </div>
      </div>
    </div>
  );
}
