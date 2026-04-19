/**
 * SnippetPad — генератор ключей для подписи обновлений (minisign-совместимый формат).
 *
 * Использование:
 *   node keys/generate-keys.js
 *
 * Результат:
 *   keys/public.key  — публичный ключ (коммитить в git МОЖНО)
 *   keys/private.key — приватный ключ (в git НЕ КОММИТИТЬ, добавлен в .gitignore)
 *
 * После генерации:
 *   1. Скопируй base64-строку публичного ключа в src-tauri/tauri.conf.json
 *      → поле plugins.updater.pubkey
 *   2. Добавь содержимое keys/private.key в GitHub Secrets
 *      → Settings → Secrets → Actions → TAURI_SIGNING_PRIVATE_KEY
 */

const crypto = require('crypto');
const blake  = require('blakejs');
const fs     = require('fs');
const path   = require('path');

// ── Генерация Ed25519 пары ──────────────────────────────────────────────────

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

// Node.js экспортирует ключи в DER-формате; последние 32 байта — нужные данные
const pubKeyRaw = Buffer.from(publicKey.export({ type: 'spki',  format: 'der' })).slice(-32);
const seedRaw   = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'der' })).slice(-32);

// В libsodium секретный ключ = seed(32) + pubkey(32) = 64 байта
const plainKeydata = Buffer.concat([seedRaw, pubKeyRaw]);

// Случайный ID ключа (8 байт)
const keyId    = crypto.randomBytes(8);
const keyIdHex = keyId.toString('hex').toUpperCase().padStart(16, '0');

// ── Публичный ключ (minisign format) ───────────────────────────────────────

// Структура: "Ed"(2) + keyId(8) + pubkey(32) = 42 байта → base64
const pubContent = Buffer.concat([Buffer.from('Ed'), keyId, pubKeyRaw]);
const pubKeyB64  = pubContent.toString('base64');
const pubKeyFile = `untrusted comment: minisign public key ${keyIdHex}\n${pubKeyB64}\n`;

// ── Приватный ключ (minisign format, пустой пароль) ────────────────────────

const kdfSalt  = crypto.randomBytes(32);
const opslimit = 33554432n;   // 2^25
const memlimit = 1073741824n; // 2^30

// Заголовок (62 байта)
const header = Buffer.alloc(2 + 2 + 2 + 32 + 8 + 8 + 8);
let off = 0;
header.write('Ed', off); off += 2; // sig_algorithm
header.write('Sc', off); off += 2; // kdf_algorithm (Scrypt)
header.write('B2', off); off += 2; // cksum_algorithm (Blake2b)
kdfSalt.copy(header, off); off += 32;
header.writeBigUInt64LE(opslimit, off); off += 8;
header.writeBigUInt64LE(memlimit, off); off += 8;
keyId.copy(header, off); off += 8;

// Контрольная сумма: blake2b-256 от заголовка + открытых данных ключа
const checksumInput = Buffer.concat([header, plainKeydata]);
const checksum      = Buffer.from(blake.blake2b(checksumInput, null, 32));

// KDF: scrypt(password="", salt, N=65536, r=8, p=1) → 64 байта
const kdfOutput  = crypto.scryptSync('', kdfSalt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
const encKeydata = Buffer.alloc(64);
for (let i = 0; i < 64; i++) encKeydata[i] = plainKeydata[i] ^ kdfOutput[i];

const secContent = Buffer.concat([header, encKeydata, checksum]);
const secKeyFile = `untrusted comment: minisign secret key ${keyIdHex}\n${secContent.toString('base64')}\n`;

// ── Запись файлов ───────────────────────────────────────────────────────────

const keysDir = path.join(__dirname);
fs.mkdirSync(keysDir, { recursive: true });
fs.writeFileSync(path.join(keysDir, 'public.key'),  pubKeyFile, 'utf8');
fs.writeFileSync(path.join(keysDir, 'private.key'), secKeyFile, 'utf8');

// ── Инструкции ──────────────────────────────────────────────────────────────

console.log('\n✅  Ключи сгенерированы!\n');
console.log('════════════════════════════════════════════════════════════════');
console.log('ПУБЛИЧНЫЙ КЛЮЧ (вставить в src-tauri/tauri.conf.json → plugins.updater.pubkey):');
console.log('────────────────────────────────────────────────────────────────');
console.log(pubKeyB64);
console.log('════════════════════════════════════════════════════════════════');
console.log('\nПриватный ключ → keys/private.key');
console.log('⚠️  Добавь в GitHub Secrets → TAURI_SIGNING_PRIVATE_KEY');
console.log('   (содержимое файла целиком, включая "untrusted comment:" строку)\n');
