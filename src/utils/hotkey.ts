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
  return { modifier: modLabel, key };
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

/** Normalize browser key name to our uppercase format */
export function normalizeKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  // Map special keys to short names
  const map: Record<string, string> = {
    " ": "SPACE",
    Enter: "ENTER",
    Backspace: "BACKSPACE",
    Delete: "DELETE",
    Tab: "TAB",
    Escape: "ESC",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Home: "HOME",
    End: "END",
    PageUp: "PAGEUP",
    PageDown: "PAGEDOWN",
    Insert: "INSERT",
    F1: "F1", F2: "F2", F3: "F3", F4: "F4",
    F5: "F5", F6: "F6", F7: "F7", F8: "F8",
    F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  };
  return map[key] ?? key.toUpperCase();
}
