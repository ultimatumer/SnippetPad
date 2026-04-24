# SnippetPad — Дневник разработки

> Полная история создания приложения: от AutoHotkey-скрипта до кросс-платформенного Tauri-приложения с автообновлением.
> Автор: Евгений Найден | AI-ассистент: Claude (Anthropic)

---

## Старт: анализ AutoHotkey-скрипта

**Задача:** Разобраться в существующем `SnippetPad.ahk` и описать его логику.

**Что делал скрипт:**
- Хранил горячие клавиши + текст в INI-файле (`snippets.ini`)
- При нажатии хоткея — копировал текст в буфер обмена и эмулировал `Ctrl+V`
- Имел простой GUI: список биндов, кнопки добавить/удалить/редактировать
- Запускался из трея

**Проблемы оригинала:**
1. **Многострочный ввод не работал** — `Enter` закрывал диалог вместо того чтобы добавить перенос строки
2. **Эмодзи отображались как `??`** — INI через `IniRead/IniWrite` писался в ANSI, не UTF-8

---

## Фикс AHK: многострочность и эмодзи

### Многострочный ввод
```ahk
; Было:
d.AddEdit("x+10 y16 w580 h60")

; Стало:
d.AddEdit("x+10 y16 w580 h120 Multi WantReturn -WantTab")
; Высота диалога: h200 → h340
```

### Эмодзи (UTF-8 вместо ANSI)
```ahk
; Заменили IniRead/IniWrite на свои функции с явной кодировкой:
_ReadFileUTF8(path) {
    f := FileOpen(path, "r", "UTF-8")
    content := f.Read()
    f.Close()
    return content
}
_WriteFileUTF8(path, content) {
    f := FileOpen(path, "w", "UTF-8")
    f.Write(content)
    f.Close()
}
```

---

## Решение: переход на Tauri

**Проблема AHK:** только Windows, нет автообновления, сложно распространять.

**Выбор стека:**
| Компонент | Технология | Почему |
|-----------|-----------|--------|
| Фреймворк | Tauri v2 | ~5 MB бинарник, Rust-бэкенд, нативные API |
| UI | React + TypeScript + Vite | Типизация, компоненты |
| Стили | Tailwind CSS | Утилитарный подход |
| Дизайн | PostHog design tokens | Тёмная тема, оранжевый акцент |
| Хоткеи | tauri-plugin-global-shortcut | OS-level, работает когда окно свёрнуто |
| Ввод текста | enigo v0.2 | Прямой ввод без буфера обмена |
| Хранилище | JSON-файл в AppData | Локально на устройстве |
| Автообновление | tauri-plugin-updater | GitHub Releases + minisign |

**Дизайн-токены PostHog:**
```
bg:       #1d1f27
surface:  #23262f
elevated: #2c2f3a
accent:   #f54e00
text:     #e8eaf0
muted:    #9ba3b2
faint:    #5c6374
danger:   #f04438
```

---

## Создание проекта вручную

`create-tauri-app` требует TTY — недоступно в Claude Code. Поэтому весь скелет создан вручную:

```
snippetpad/
├── src/                        # React + TS фронтенд
│   ├── App.tsx                 # Главный компонент
│   ├── types.ts                # Snippet интерфейс
│   ├── components/
│   │   ├── BindEditor.tsx      # Модальный редактор
│   │   └── KeyBadge.tsx        # Отображение хоткеев
│   └── utils/
│       └── hotkey.ts           # Нормализация клавиш
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Логика: хранилище, хоткеи, трей
│   │   └── main.rs             # Точка входа
│   ├── icons/                  # .ico, .png иконки
│   ├── Cargo.toml
│   └── tauri.conf.json
├── keys/
│   ├── generate-keys.cjs       # Генератор Ed25519 ключей
│   ├── public.key              # В git (можно)
│   └── private.key             # В .gitignore (никогда не коммитить)
├── .github/workflows/
│   └── release.yml             # CI/CD: Windows + macOS
├── .gitignore
└── package.json
```

---

## Технические решения и баги

### 1. Иконки — неверный формат
**Проблема:** Tauri требует RGBA PNG (color type 6) и валидный ICO с BGRA-битмапом.

**Решение:** Node.js-скрипт, генерирующий PNG/ICO с нуля:
- PNG: zlib deflate, CRC32, заголовки IHDR/IDAT/IEND, color type 6 (RGBA)
- ICO: корректный BITMAPINFOHEADER с `biHeight * 2`, BGRA порядок байт

### 2. TypeScript E6133 — неиспользуемый импорт
```diff
- import { KeyBadge, HotkeyBadges } from "./KeyBadge";
+ import { HotkeyBadges } from "./KeyBadge";
```

### 3. Rust E0716 — временный borrow
**Проблема:** `modifier.to_uppercase().as_str()` — временный объект уничтожается до match.

```rust
// Было (не компилируется):
let mod_norm = match modifier.to_uppercase().as_str() { ... }

// Стало:
let upper = modifier.to_uppercase();
let mod_norm = match upper.as_str() { ... }
```

### 4. Хоткеи не срабатывали (ALT+1)
**Причина:** `tauri-plugin-global-shortcut` требует Web KeyboardEvent.code формат.

```
"1"  → должно быть "Digit1"
"k"  → должно быть "KeyK"
"ALT" → должно быть "Alt"
```

**Решение в `hotkey.ts`:**
```typescript
export function normalizeKey(key: string): string {
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (key.length === 1 && /^[0-9]$/.test(key))    return `Digit${key}`;
  if (key === " ") return "Space";
  return key;  // F1, ArrowLeft, etc. — как есть
}
```

**Решение в `lib.rs` (`normalize_hotkey`):**
```rust
fn normalize_hotkey(hk: &str) -> String {
    let Some(plus) = hk.find('+') else { return hk.to_string() };
    let modifier = &hk[..plus];
    let key      = &hk[plus+1..];
    let upper    = modifier.to_uppercase();
    let mod_norm = match upper.as_str() {
        "CTRL" | "CONTROL"               => "Ctrl",
        "ALT"                            => "Alt",
        "SHIFT"                          => "Shift",
        "META" | "WIN" | "SUPER" | "CMD" => "Super",
        other                            => other,
    };
    format!("{mod_norm}+{key}")
}
```

### 5. Ubuntu упала из-за enigo (libxdo)
**Решение:** убрали Linux из матрицы CI, оставили только Windows + macOS.

### 6. Node.js 20 deprecation в CI
```diff
- node-version: '20'
+ node-version: '24'
```

### 7. Иконка трея была пустой
```rust
// Было — builder без иконки:
TrayIconBuilder::new().menu(&menu)...

// Стало:
let icon = app.default_window_icon().cloned().expect("no default icon");
TrayIconBuilder::new().icon(icon).menu(&menu)...
```

### 8. scrypt maxmem exceeded при генерации ключей
```javascript
// Добавили явный лимит памяти:
crypto.scryptSync(password, salt, 32, {
    N: 65536, r: 8, p: 1,
    maxmem: 128 * 1024 * 1024  // 128 MB
})
```

### 9. ES module scope error в generate-keys
```
// package.json имеет "type": "module" → .js не может использовать require()
generate-keys.js → generate-keys.cjs
```

---

## Эволюция механизма вставки

### Этап 1: Clipboard + Ctrl+V (как AHK)
```
Хоткей → скопировать текст в буфер → эмулировать Ctrl+V
```
❌ Проблема: требует фокус на нужном окне, затирает буфер обмена, нужен доп. Ctrl+V

### Этап 2: enigo.text() — прямой ввод
```rust
fn type_text(_app: &AppHandle, text: &str,
             shortcut: &tauri_plugin_global_shortcut::Shortcut) {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    match Enigo::new(&Settings::default()) {
        Ok(mut enigo) => {
            release_shortcut_modifiers(&mut enigo, shortcut);
            std::thread::sleep(std::time::Duration::from_millis(10));
            if let Err(e) = enigo.text(text) {
                eprintln!("Text input failed: {e}");
            }
        }
        Err(e) => eprintln!("Enigo init failed: {e}"),
    }
}

fn release_shortcut_modifiers(enigo: &mut enigo::Enigo,
                               shortcut: &tauri_plugin_global_shortcut::Shortcut) {
    use enigo::{Direction, Key, Keyboard};
    use tauri_plugin_global_shortcut::Modifiers;
    if shortcut.mods.contains(Modifiers::ALT)     { let _ = enigo.key(Key::Alt,     Direction::Release); }
    if shortcut.mods.contains(Modifiers::SHIFT)   { let _ = enigo.key(Key::Shift,   Direction::Release); }
    if shortcut.mods.contains(Modifiers::CONTROL) { let _ = enigo.key(Key::Control, Direction::Release); }
    if shortcut.mods.contains(Modifiers::SUPER)   { let _ = enigo.key(Key::Meta,    Direction::Release); }
}
```
✅ Текст вставляется мгновенно при нажатии хоткея, буфер не затрагивается

---

## Автообновление

### Генерация ключей (minisign-совместимый формат)

Tauri updater использует Ed25519 + blake2b-256 (формат minisign).
`tauri signer generate` требует интерактивный TTY → написан скрипт `keys/generate-keys.cjs`:

```
Ed25519 keypair (Node crypto)
    → blake2b-256 хэш публичного ключа (blakejs)
    → scrypt KDF (пустой пароль, N=65536)
    → minisign binary формат
    → base64 строки
```

### tauri.conf.json
```json
{
  "plugins": {
    "updater": {
      "pubkey": "RWQ+aHrep9xFhIiJJ4f/3l8NNgWwym1Bw4YafuFetuWYAZb1/Pzux+5i",
      "endpoints": [
        "https://github.com/ultimatumer/SnippetPad/releases/latest/download/latest.json"
      ],
      "dialog": false
    }
  }
}
```

### GitHub Actions (release.yml)
- Триггер: `push` на тег `v*`
- Матрица: `windows-latest` + `macos-latest` (universal: x86_64 + aarch64)
- Секрет: `TAURI_SIGNING_PRIVATE_KEY` → добавлен в Settings → Secrets → Actions
- `updaterJsonKeepUniversal: true` → генерирует `latest.json` для автообновления

### Баннер обновления в UI
```tsx
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
```

---

## Хронология релизов

| Тег | Что изменилось |
|-----|---------------|
| v0.1.1 | Первый рабочий билд: список биндов, тёмная тема |
| v0.1.2 | Фикс иконок (RGBA PNG + валидный ICO) |
| v0.1.3 | Фикс хоткеев: KeyCode-формат, normalize_hotkey |
| v0.1.4 | Автообновление, ключи подписи, баннер обновления в UI |
| v0.1.5 | Прямой ввод через enigo.text(), отказ от clipboard+Ctrl+V |

---

## Cargo.toml зависимости

```toml
[dependencies]
tauri                        = { version = "2", features = ["tray-icon"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-updater         = "2"
tauri-plugin-process         = "2"
serde                        = { version = "1", features = ["derive"] }
serde_json                   = "1"
enigo                        = "0.2"
```

---

## Итог

За одну сессию с нуля построено полноценное десктопное приложение:

- ✅ Windows (x64) — `.msi` + `.exe` installer
- ✅ macOS (universal: M1/M2/M3 + Intel) — `.dmg`
- ✅ Глобальные хоткеи (работают когда приложение свёрнуто)
- ✅ Прямой ввод текста без Ctrl+V и без clipboard
- ✅ Автообновление через GitHub Releases (подписанное Ed25519)
- ✅ Трей-иконка, закрытие в трей
- ✅ PostHog-тёмный дизайн
- ✅ CI/CD через GitHub Actions (автосборка при создании тега)
- ✅ Локальное хранилище (JSON в AppData, не синхронизируется)
- ✅ Горячая замена: старые AHK-пользователи могут просто поставить и удалить AHK-скрипт
