// Internal format: "CTRL+K", "ALT+F", "SHIFT+SPACE", "META+K"
// Display: { modifier: "Ctrl", key: "K" }

export const MODIFIERS = ["CTRL", "ALT", "SHIFT", "META"] as const;
export type Modifier = (typeof MODIFIERS)[number];

export const MODIFIER_DISPLAY: Record<Modifier, string> = {
  CTRL:  "Ctrl",
  ALT:   "Alt",
  SHIFT: "Shift",
  META:  "Win / Cmd",
};

export function parseHotkey(hk: string): { modifier: string; key: string } {
  if (!hk) return { modifier: "", key: "" };
  const plus = hk.indexOf("+");
  if (plus < 0) return { modifier: "", key: hk };
  return {
    modifier: hk.slice(0, plus),
    key: hk.slice(plus + 1),
  };
}

export function buildHotkey(modifier: string, key: string): string {
  return `${modifier.toUpperCase()}+${key.toUpperCase()}`;
}

export function hotkeyDisplay(hk: string): { modifier: string; key: string } {
  const { modifier, key } = parseHotkey(hk);
  const modLabel = MODIFIER_DISPLAY[modifier as Modifier] ?? modifier;
  return { modifier: modLabel, key: codeToDisplay(key) };
}

/** Map browser KeyboardEvent modifier to our format */
export function eventModifier(e: KeyboardEvent): string {
  if (e.ctrlKey)  return "CTRL";
  if (e.altKey)   return "ALT";
  if (e.shiftKey) return "SHIFT";
  if (e.metaKey)  return "META";
  return "";
}

const IGNORED_KEYS = new Set([
  "Control", "Alt", "Shift", "Meta",
  "CapsLock", "NumLock", "ScrollLock",
]);

export function isModifierKey(key: string): boolean {
  return IGNORED_KEYS.has(key);
}

/**
 * Normalize browser key name to Code format expected by tauri-plugin-global-shortcut.
 * Letters → "KeyK", digits → "Digit1", specials → "Space", "Enter", "F1" etc.
 */
export function normalizeKey(key: string): string {
  // Single letter a-z/A-Z → KeyA .. KeyZ
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  // Single digit 0-9 → Digit0 .. Digit9
  if (key.length === 1 && /^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }
  // Space
  if (key === " ") return "Space";
  // Pass through known Code-compatible names as-is
  const passThrough = new Set([
    "Enter", "Backspace", "Delete", "Tab", "Escape",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown", "Insert",
    "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
    "Minus", "Equal", "BracketLeft", "BracketRight",
    "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash",
    "Backquote",
  ]);
  if (passThrough.has(key)) return key;
  return key;
}

/** Convert stored Code key back to a short display label */
export function codeToDisplay(code: string): string {
  if (code.startsWith("Key") && code.length === 4)   return code.slice(3);        // KeyK → K
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);        // Digit1 → 1
  const labels: Record<string, string> = {
    Space: "Space", Enter: "Enter", Backspace: "⌫", Delete: "Del",
    Tab: "Tab", Escape: "Esc",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn", Insert: "Ins",
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    Backquote: "`",
  };
  return labels[code] ?? code;
}
