// vault.js — open & save Ragasiyam .vault files entirely in the browser.
//
// Byte-compatible with the desktop app (ragasiyam/crypto.py + vault.py):
//   secret --Argon2id--> KEK  --AES-256-GCM unwrap--> DEK
//   DEK    --AES-256-GCM--> entries JSON
// Argon2id via hash-wasm (global `hashwasm`); AES-256-GCM via the browser's
// native WebCrypto (which stores the tag appended to the ciphertext, exactly
// like Python's AESGCM).

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export class VaultError extends Error {}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function normalizeRecovery(text) {
  let s = '';
  for (const ch of text.toUpperCase()) if (RECOVERY_ALPHABET.includes(ch)) s += ch;
  return enc.encode(s);
}

async function deriveKek(secretBytes, salt) {
  // Matches ARGON2_* constants in crypto.py.
  return await window.hashwasm.argon2id({
    password: secretBytes,
    salt,
    parallelism: 4,
    iterations: 3,
    memorySize: 65536, // KiB (64 MiB)
    hashLength: 32,
    outputType: 'binary',
  });
}

async function aesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function gcmDecrypt(keyBytes, nonce, ctAndTag) {
  const key = await aesKey(keyBytes);
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, ctAndTag);
  return new Uint8Array(clear);
}
async function gcmEncrypt(keyBytes, plaintext) {
  const key = await aesKey(keyBytes);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, plaintext));
  return { nonce, ct };
}

export function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '');
}

export class Vault {
  constructor(doc, dek, entries) {
    this.doc = doc;     // original parsed document (keeps the wraps)
    this.dek = dek;     // Uint8Array(32), kept in memory while unlocked
    this.entries = entries;
  }

  static async open(text, secret, useRecovery = false) {
    let doc;
    try { doc = JSON.parse(text); } catch { throw new VaultError('This file is not a readable vault.'); }
    if (!doc || doc.magic !== 'RAGASIYAM-VAULT') throw new VaultError('Not a Ragasiyam vault file.');

    const which = useRecovery ? 'recovery' : 'master';
    const wrap = doc.wraps && doc.wraps[which];
    if (!wrap) throw new VaultError(`Vault has no "${which}" credential.`);

    const salt = b64ToBytes(wrap.salt);
    const secretBytes = useRecovery ? normalizeRecovery(secret) : enc.encode(secret);
    const kek = await deriveKek(secretBytes, salt);

    let dek;
    try {
      dek = await gcmDecrypt(kek, b64ToBytes(wrap.sealed.nonce), b64ToBytes(wrap.sealed.ct));
    } catch { throw new VaultError('Incorrect master password or recovery key.'); }

    let clear;
    try {
      clear = await gcmDecrypt(dek, b64ToBytes(doc.vault.nonce), b64ToBytes(doc.vault.ct));
    } catch { throw new VaultError('Vault contents could not be decrypted (file may be corrupt).'); }

    const entries = JSON.parse(dec.decode(clear));
    return new Vault(doc, dek, entries);
  }

  categories() {
    const s = new Set(this.entries.map((e) => (e.category || 'General').trim() || 'General'));
    s.add('General');
    return [...s].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }
  personas() {
    return [...new Set(this.entries.map((e) => (e.persona || '').trim()).filter(Boolean))]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  // Re-encrypt the entries under the same DEK and return the .vault file text.
  async toFileText() {
    const plaintext = enc.encode(JSON.stringify(this.entries));
    const { nonce, ct } = await gcmEncrypt(this.dek, plaintext);
    const out = {
      magic: 'RAGASIYAM-VAULT',
      version: 1,
      kdf: { type: 'argon2id', time_cost: 3, memory_cost: 65536, parallelism: 4 },
      wraps: this.doc.wraps,
      vault: { nonce: bytesToB64(nonce), ct: bytesToB64(ct) },
    };
    return JSON.stringify(out, null, 2);
  }
}

// Keep entries limited to the fields the desktop dataclass understands.
export function makeEntry(data) {
  return {
    title: data.title || '',
    username: data.username || '',
    password: data.password || '',
    url: data.url || '',
    notes: data.notes || '',
    category: (data.category || 'General').trim() || 'General',
    persona: (data.persona || '').trim(),
    id: data.id || newId(),
    updated_at: Date.now() / 1000,
  };
}

export function generatePassword(length = 20) {
  const pools = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*()-_=+[]{};:,.?',
  ];
  const all = pools.join('');
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = pools.map((p) => p[rnd(p.length)]);
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
