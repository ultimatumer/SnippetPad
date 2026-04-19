# Ключи подписи обновлений

## Структура папки

```
keys/
├── generate-keys.cjs   — скрипт генерации пары ключей
├── public.key          — публичный ключ (в git коммитить МОЖНО)
├── private.key         — приватный ключ (в .gitignore, НИКОГДА не коммитить)
└── README.md           — эта инструкция
```

## Как это работает

При каждом релизе GitHub Actions подписывает бинарники приватным ключом.
Приложение проверяет подпись публичным ключом перед установкой обновления.
Это защищает пользователей от поддельных обновлений.

## Если нужно перегенерировать ключи

```bash
node keys/generate-keys.cjs
```

После генерации:
1. Скопируй base64-строку публичного ключа в `src-tauri/tauri.conf.json`
   → поле `plugins.updater.pubkey`
2. Добавь содержимое `keys/private.key` в GitHub Secrets:
   → Репозиторий → Settings → Secrets and variables → Actions
   → New repository secret: `TAURI_SIGNING_PRIVATE_KEY`
   → Значение: содержимое файла `keys/private.key` целиком

## Текущий публичный ключ

Публичный ключ вшит в приложение через `src-tauri/tauri.conf.json`.
Файл `keys/public.key` — для истории и резервной копии.

## Важно

- `private.key` добавлен в `.gitignore` и никогда не попадает в git
- Потеря приватного ключа означает невозможность выпуска обновлений
- Храни резервную копию `private.key` в защищённом месте (1Password, Bitwarden и т.д.)
