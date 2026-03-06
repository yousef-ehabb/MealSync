import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { machineIdSync } = require('node-machine-id');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let cachedKey = null;

function getEncryptionKey() {
    if (cachedKey) return cachedKey;
    const machineId = machineIdSync({ original: true });
    cachedKey = crypto.createHash('sha256').update(machineId).digest();
    return cachedKey;
}

export function encrypt(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return { encrypted, iv: iv.toString('hex'), authTag };
}

export function decrypt({ encrypted, iv, authTag }) {
    const key = getEncryptionKey();
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

export function encryptCredentials(studentId, password) {
    const payload = JSON.stringify({ studentId, password });
    return encrypt(payload);
}

export function decryptCredentials(encryptedData) {
    const json = decrypt(encryptedData);
    return JSON.parse(json);
}
