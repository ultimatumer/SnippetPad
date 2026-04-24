use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const APP_NAME: &str = "Customer Support Binder";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Snippet {
    pub id: String,
    pub hotkey: String,
    pub text: String,
    pub command: String,
}

pub struct SnippetsState(pub Mutex<Vec<Snippet>>);

fn normalize_line_endings(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn encode_snippet_text(text: &str) -> String {
    let normalized = normalize_line_endings(text);
    let mut encoded = String::with_capacity(normalized.len());

    for ch in normalized.chars() {
        match ch {
            '\\' => encoded.push_str("\\\\"),
            '\n' => encoded.push_str("\\n"),
            _ => encoded.push(ch),
        }
    }

    encoded
}

fn decode_snippet_text(text: &str) -> String {
    let mut decoded = String::with_capacity(text.len());
    let mut chars = text.chars();

    while let Some(ch) = chars.next() {
        if ch != '\\' {
            decoded.push(ch);
            continue;
        }

        match chars.next() {
            Some('n') => decoded.push('\n'),
            Some('\\') => decoded.push('\\'),
            Some(other) => {
                decoded.push('\\');
                decoded.push(other);
            }
            None => decoded.push('\\'),
        }
    }

    normalize_line_endings(&decoded)
}

fn decode_snippet_for_client(snippet: &Snippet) -> Snippet {
    let mut decoded = snippet.clone();
    decoded.text = decode_snippet_text(&decoded.text);
    decoded
}

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
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(snippets) {
        let _ = std::fs::write(path, json.as_bytes());
    }
}

fn normalize_hotkey(hotkey: &str) -> String {
    let Some(plus) = hotkey.find('+') else {
        return hotkey.to_string();
    };

    let modifier = &hotkey[..plus];
    let key = &hotkey[plus + 1..];
    let upper = modifier.to_uppercase();
    let normalized_modifier = match upper.as_str() {
        "CTRL" | "CONTROL" => "Ctrl",
        "ALT" => "Alt",
        "SHIFT" => "Shift",
        "META" | "WIN" | "SUPER" | "CMD" => "Super",
        other => other,
    };

    format!("{normalized_modifier}+{key}")
}

fn re_register(app: &AppHandle, snippets: &[Snippet]) {
    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();

    for snippet in snippets {
        if snippet.hotkey.is_empty() {
            continue;
        }

        let text = snippet.text.clone();
        let app_handle = app.clone();
        let hotkey = normalize_hotkey(&snippet.hotkey);

        if let Err(error) =
            global_shortcut.on_shortcut(hotkey.as_str(), move |_app, shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    type_text(&app_handle, &text, shortcut);
                }
            })
        {
            eprintln!("Failed to register shortcut {hotkey}: {error}");
        }
    }
}

fn type_text(_app: &AppHandle, text: &str, shortcut: &tauri_plugin_global_shortcut::Shortcut) {
    use enigo::{Enigo, Keyboard, Settings};

    let decoded_text = decode_snippet_text(text);

    match Enigo::new(&Settings::default()) {
        Ok(mut enigo) => {
            release_shortcut_modifiers(&mut enigo, shortcut);
            std::thread::sleep(std::time::Duration::from_millis(10));

            if has_line_breaks(&decoded_text) {
                if let Err(error) = paste_text(&mut enigo, &decoded_text) {
                    eprintln!("Multiline paste failed: {error}");
                }
            } else if let Err(error) = enigo.text(&decoded_text) {
                eprintln!("Text input failed: {error}");
            }
        }
        Err(error) => eprintln!("Enigo init failed: {error}"),
    }
}

fn has_line_breaks(text: &str) -> bool {
    text.contains(['\n', '\r'])
}

fn paste_text(enigo: &mut enigo::Enigo, text: &str) -> Result<(), String> {
    use arboard::Clipboard;

    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    let previous = clipboard.get_text().ok();

    clipboard
        .set_text(text.to_string())
        .map_err(|error| error.to_string())?;

    std::thread::sleep(std::time::Duration::from_millis(20));
    press_paste_shortcut(enigo).map_err(|error| error.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(120));

    match previous {
        Some(value) => {
            let _ = clipboard.set_text(value);
        }
        None => {
            let _ = clipboard.clear();
        }
    }

    Ok(())
}

fn press_paste_shortcut(enigo: &mut enigo::Enigo) -> Result<(), enigo::InputError> {
    use enigo::{Direction, Key, Keyboard};

    let paste_modifier = paste_modifier_key();

    enigo.key(paste_modifier, Direction::Press)?;
    enigo.key(Key::V, Direction::Click)?;
    enigo.key(paste_modifier, Direction::Release)
}

#[cfg(target_os = "macos")]
fn paste_modifier_key() -> enigo::Key {
    enigo::Key::Meta
}

#[cfg(not(target_os = "macos"))]
fn paste_modifier_key() -> enigo::Key {
    enigo::Key::Control
}

fn release_shortcut_modifiers(
    enigo: &mut enigo::Enigo,
    shortcut: &tauri_plugin_global_shortcut::Shortcut,
) {
    use enigo::{Direction, Key, Keyboard};
    use tauri_plugin_global_shortcut::Modifiers;

    if shortcut.mods.contains(Modifiers::ALT) {
        let _ = enigo.key(Key::Alt, Direction::Release);
    }
    if shortcut.mods.contains(Modifiers::SHIFT) {
        let _ = enigo.key(Key::Shift, Direction::Release);
    }
    if shortcut.mods.contains(Modifiers::CONTROL) {
        let _ = enigo.key(Key::Control, Direction::Release);
    }
    if shortcut.mods.contains(Modifiers::SUPER) {
        let _ = enigo.key(Key::Meta, Direction::Release);
    }
}

#[tauri::command]
fn get_snippets(state: State<SnippetsState>) -> Vec<Snippet> {
    state
        .0
        .lock()
        .unwrap()
        .iter()
        .map(decode_snippet_for_client)
        .collect()
}

#[tauri::command]
fn save_snippet(
    app: AppHandle,
    state: State<SnippetsState>,
    mut snippet: Snippet,
) -> Result<(), String> {
    snippet.text = encode_snippet_text(&snippet.text);
    let mut snippets = state.0.lock().unwrap();

    let is_hotkey_change = snippets
        .iter()
        .find(|existing| existing.id == snippet.id)
        .map(|existing| existing.hotkey != snippet.hotkey)
        .unwrap_or(true);

    if is_hotkey_change
        && !snippet.hotkey.is_empty()
        && snippets
            .iter()
            .any(|existing| existing.hotkey == snippet.hotkey && existing.id != snippet.id)
    {
        return Err("Этот хоткей уже занят".into());
    }

    if let Some(position) = snippets
        .iter()
        .position(|existing| existing.id == snippet.id)
    {
        snippets[position] = snippet;
    } else {
        snippets.push(snippet);
    }

    persist(&app, &snippets);
    re_register(&app, &snippets);
    Ok(())
}

#[tauri::command]
fn delete_snippet(app: AppHandle, state: State<SnippetsState>, id: String) -> Result<(), String> {
    let mut snippets = state.0.lock().unwrap();
    snippets.retain(|snippet| snippet.id != id);
    persist(&app, &snippets);
    re_register(&app, &snippets);
    Ok(())
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Открыть", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = app.default_window_icon().cloned().expect("no default icon");

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(APP_NAME)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
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
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let snippets = load_from_disk(app.handle());
            re_register(app.handle(), &snippets);
            app.manage(SnippetsState(Mutex::new(snippets)));

            setup_tray(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
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
