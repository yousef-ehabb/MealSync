import crypto from 'crypto';
import { createRequire } from 'module';
import log from 'electron-log';
const require = createRequire(import.meta.url);
const { machineIdSync } = require('node-machine-id');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KDF_ITERATIONS = 100_000;
const KDF_LENGTH = 32;
const KDF_DIGEST = 'sha256';

let cachedKey = null;
let cachedLegacyKey = null;

// ── Key derivation ──────────────────────────────────────────────

function getOrCreateSalt(store) {
    let salt = store.get('_keySalt');
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
        store.set('_keySalt', salt);
    }
    return Buffer.from(salt, 'hex');
}

function getEncryptionKey(store) {
    if (cachedKey) return cachedKey;
    const machineId = machineIdSync({ original: true });
    const salt = getOrCreateSalt(store);
    cachedKey = crypto.pbkdf2Sync(machineId, salt, KDF_ITERATIONS, KDF_LENGTH, KDF_DIGEST);
    return cachedKey;
}

/** Legacy SHA-256 key — used only during migration from pre-PBKDF2 installs. */
function getLegacyKey() {
    if (cachedLegacyKey) return cachedLegacyKey;
    const machineId = machineIdSync({ original: true });
    cachedLegacyKey = crypto.createHash('sha256').update(machineId).digest();
    return cachedLegacyKey;
}

// ── Low-level helpers ───────────────────────────────────────────

function encryptWithKey(plaintext, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { encrypted, iv: iv.toString('hex'), authTag };
}

function decryptWithKey({ encrypted, iv, authTag }, key) {
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ── Public API ──────────────────────────────────────────────────

export function encrypt(plaintext, store) {
    const key = getEncryptionKey(store);
    return encryptWithKey(plaintext, key);
}

export function decrypt(data, store) {
    const key = getEncryptionKey(store);
    return decryptWithKey(data, key);
}

export function encryptCredentials(studentId, password, store) {
    const payload = JSON.stringify({ studentId, password });
    return encrypt(payload, store);
}

export function decryptCredentials(encryptedData, store) {
    const json = decrypt(encryptedData, store);
    return JSON.parse(json);
}

/**
 * Decrypt with PBKDF2 key first; if that fails, try legacy SHA-256 key.
 * On successful legacy decrypt, re-encrypts with PBKDF2 and updates store.
 * @throws {Error} with message 'CREDENTIALS_UNRECOVERABLE' if both fail.
 */
export function decryptCredentialsWithMigration(encryptedData, store) {
    // Try new PBKDF2 key first
    try {
        const newKey = getEncryptionKey(store);
        const json = decryptWithKey(encryptedData, newKey);
        return JSON.parse(json);
    } catch (_) { /* PBKDF2 key failed — try legacy */ }

    // Fallback to old SHA-256 key
    try {
        const oldKey = getLegacyKey();
        const json = decryptWithKey(encryptedData, oldKey);
        const parsed = JSON.parse(json);

        // Re-encrypt with new PBKDF2 key and save
        const newKey = getEncryptionKey(store);
        const newEncrypted = encryptWithKey(json, newKey);
        store.set('credentials', newEncrypted);
        log.info('[Encryption] Credentials migrated from SHA-256 to PBKDF2.');

        return parsed;
    } catch (_) { /* Legacy key also failed */ }

    // Both failed — credentials are unrecoverable
    throw new Error('CREDENTIALS_UNRECOVERABLE');
}
