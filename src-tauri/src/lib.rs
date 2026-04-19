use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Snippet {
    pub id:      String,
    pub hotkey:  String,
    pub text:    String,
    pub command: String,
}

pub struct SnippetsState(pub Mutex<Vec<Snippet>>);

// ── Storage ────────────────────────────────────────────────────────────────

fn snippets_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("cannot resolve app data dir")
        .join("snippets.json")
}

fn load_from_disk(app: &AppHandle) -> Vec<Snippet> {
    let path = snippets_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist(app: &AppHandle, snippets: &[Snippet]) {
    let path = snippets_path(app);
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    if let Ok(json) = serde_json::to_string_pretty(snippets) {
        let _ = std::fs::write(path, json.as_bytes());
    }
}

// ── Shortcut registration ──────────────────────────────────────────────────

/// Convert our stored format "ALT+Digit1" → "Alt+Digit1" (title-case modifier).
fn normalize_hotkey(hk: &str) -> String {
    let Some(plus) = hk.find('+') else { return hk.to_string() };
    let modifier = &hk[..plus];
    let key      = &hk[plus+1..];
    let upper    = modifier.to_uppercase();
    let mod_norm = match upper.as_str() {
        "CTRL"  | "CONTROL"              => "Ctrl",
        "ALT"                            => "Alt",
        "SHIFT"                          => "Shift",
        "META" | "WIN" | "SUPER" | "CMD" => "Super",
        other                            => other,
    };
    format!("{mod_norm}+{key}")
}

fn re_register(app: &AppHandle, snippets: &[Snippet]) {
    let gsc = app.global_shortcut();
    let _ = gsc.unregister_all();

    for snip in snippets {
        if snip.hotkey.is_empty() {
            continue;
        }
        let text   = snip.text.clone();
        let app2   = app.clone();
        let hotkey = normalize_hotkey(&snip.hotkey);

        if let Err(e) = gsc.on_shortcut(hotkey.as_str(), move |_app, _sc, event| {
            if event.state() == ShortcutState::Pressed {
                paste_text(&app2, &text);
            }
        }) {
            eprintln!("Failed to register shortcut {hotkey}: {e}");
        }
    }
}

// ── Paste ──────────────────────────────────────────────────────────────────

fn paste_text(app: &AppHandle, text: &str) {
    // Write to system clipboard
    if let Err(e) = app.clipboard().write_text(text) {
        eprintln!("Clipboard write failed: {e}");
        return;
    }

    // Small pause so target app can process the clipboard write
    std::thread::sleep(std::time::Duration::from_millis(80));

    // Simulate Ctrl+V (or Cmd+V on macOS)
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    match Enigo::new(&Settings::default()) {
        Ok(mut enigo) => {
            #[cfg(target_os = "macos")]
            {
                let _ = enigo.key(Key::Meta,      Direction::Press);
                let _ = enigo.key(Key::Unicode('v'), Direction::Click);
                let _ = enigo.key(Key::Meta,      Direction::Release);
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = enigo.key(Key::Control,      Direction::Press);
                let _ = enigo.key(Key::Unicode('v'), Direction::Click);
                let _ = enigo.key(Key::Control,      Direction::Release);
            }
        }
        Err(e) => eprintln!("Enigo init failed: {e}"),
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn get_snippets(state: State<SnippetsState>) -> Vec<Snippet> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn save_snippet(
    app:     AppHandle,
    state:   State<SnippetsState>,
    snippet: Snippet,
) -> Result<(), String> {
    let mut snippets = state.0.lock().unwrap();

    // Duplicate hotkey check (only for new or changed hotkey)
    let is_hotkey_change = snippets
        .iter()
        .find(|s| s.id == snippet.id)
        .map(|s| s.hotkey != snippet.hotkey)
        .unwrap_or(true); // new snippet

    if is_hotkey_change && !snippet.hotkey.is_empty()
        && snippets.iter().any(|s| s.hotkey == snippet.hotkey && s.id != snippet.id)
    {
        return Err("Этот хоткей уже занят".into());
    }

    if let Some(pos) = snippets.iter().position(|s| s.id == snippet.id) {
        snippets[pos] = snippet;
    } else {
        snippets.push(snippet);
    }

    persist(&app, &snippets);
    re_register(&app, &snippets);
    Ok(())
}

#[tauri::command]
fn delete_snippet(
    app:   AppHandle,
    state: State<SnippetsState>,
    id:    String,
) -> Result<(), String> {
    let mut snippets = state.0.lock().unwrap();
    snippets.retain(|s| s.id != id);
    persist(&app, &snippets);
    re_register(&app, &snippets);
    Ok(())
}

// ── Tray ───────────────────────────────────────────────────────────────────

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Открыть",    true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход",      true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = app.default_window_icon()
        .cloned()
        .expect("no default icon");

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("SnippetPad")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ── Entry point ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Load persisted snippets
            let snippets = load_from_disk(app.handle());
            re_register(app.handle(), &snippets);
            app.manage(SnippetsState(Mutex::new(snippets)));

            // System tray
            setup_tray(app)?;

            // Hide to tray on close (don't quit)
            if let Some(window) = app.get_webview_window("main") {
                let w2 = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w2.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snippets,
            save_snippet,
            delete_snippet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
