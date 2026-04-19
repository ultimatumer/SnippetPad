export interface Snippet {
  id: string;
  hotkey: string;   // e.g. "CTRL+K", "ALT+F"
  text: string;
  command: string;  // e.g. "/hello" or ""
}
