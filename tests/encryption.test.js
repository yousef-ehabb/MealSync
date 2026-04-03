import { encrypt, decrypt, encryptCredentials, decryptCredentials } from '../electron/encryption.js';
import assert from 'assert';

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
    } catch (err) {
        console.log(`  ❌ ${name}`);
        console.error(`     ${err.message}`);
        process.exitCode = 1;
    }
}

console.log('\n🔐 Encryption Tests\n');

test('round-trip encrypt/decrypt preserves plaintext', () => {
    const original = 'Hello, World! مرحبا';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, original);
});

test('different encryptions produce different ciphertext (random IV)', () => {
    const text = 'same-text';
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    assert.notStrictEqual(enc1.iv, enc2.iv);
    assert.notStrictEqual(enc1.encrypted, enc2.encrypted);
});

test('tampered authTag throws error', () => {
    const encrypted = encrypt('secret');
    encrypted.authTag = 'a'.repeat(32);
    assert.throws(() => decrypt(encrypted));
});

test('tampered ciphertext throws error', () => {
    const encrypted = encrypt('secret');
    encrypted.encrypted = 'ff' + encrypted.encrypted.slice(2);
    assert.throws(() => decrypt(encrypted));
});

test('empty string round-trip works', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, '');
});

test('credential encrypt/decrypt round-trip', () => {
    const studentId = '12345678901234';
    const password = 'dummy_password_123';
    const encrypted = encryptCredentials(studentId, password);
    const { studentId: sId, password: pw } = decryptCredentials(encrypted);
    assert.strictEqual(sId, studentId);
    assert.strictEqual(pw, password);
});

test('unicode and special characters round-trip', () => {
    const text = '🔑 كلمة المرور: t3$t!@# éàü';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, text);
});

console.log('\n✨ All tests complete!\n');
