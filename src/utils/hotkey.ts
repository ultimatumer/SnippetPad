export const MODIFIERS = ["CTRL", "ALT", "SHIFT", "META"] as const;
export type Modifier = (typeof MODIFIERS)[number];

const DEFAULT_MODIFIER_DISPLAY: Record<Modifier, string> = {
  CTRL: "Ctrl",
  ALT: "Alt",
  SHIFT: "Shift",
  META: "Win / Cmd",
};

const MAC_MODIFIER_DISPLAY: Record<Modifier, string> = {
  CTRL: "Control",
  ALT: "Option",
  SHIFT: "Shift⇧",
  META: "Command",
};

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
}

export function getModifierDisplayMap(): Record<Modifier, string> {
  return isMacPlatform() ? MAC_MODIFIER_DISPLAY : DEFAULT_MODIFIER_DISPLAY;
}

export const MODIFIER_DISPLAY: Record<Modifier, string> = getModifierDisplayMap();

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
  const modifierDisplay = getModifierDisplayMap();
  const modLabel = modifierDisplay[modifier as Modifier] ?? modifier;
  return { modifier: modLabel, key: codeToDisplay(key) };
}

export function eventModifier(e: KeyboardEvent): string {
  if (e.ctrlKey) return "CTRL";
  if (e.altKey) return "ALT";
  if (e.shiftKey) return "SHIFT";
  if (e.metaKey) return "META";
  return "";
}

const IGNORED_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "CapsLock", "NumLock", "ScrollLock"]);

export function isModifierKey(key: string): boolean {
  return IGNORED_KEYS.has(key);
}

export function normalizeKey(key: string): string {
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  if (key.length === 1 && /^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }
  if (key === " ") return "Space";

  const passThrough = new Set([
    "Enter",
    "Backspace",
    "Delete",
    "Tab",
    "Escape",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Insert",
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
    "Minus",
    "Equal",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "Semicolon",
    "Quote",
    "Comma",
    "Period",
    "Slash",
    "Backquote",
  ]);

  if (passThrough.has(key)) return key;
  return key;
}

export function codeToDisplay(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);

  const labels: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Backspace: "\u232b",
    Delete: "Del",
    Tab: "Tab",
    Escape: "Esc",
    ArrowUp: "\u2191",
    ArrowDown: "\u2193",
    ArrowLeft: "\u2190",
    ArrowRight: "\u2192",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
    Insert: "Ins",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
  };

  return labels[code] ?? code;
}
