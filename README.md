# mycro — Ragasiyam vault, in your browser 🔐

**mycro** is a static web app (GitHub Pages) that opens your Ragasiyam
`.vault` file and lets you view and manage your credentials — **entirely in your
browser**. The file is never uploaded; it's decrypted on your device with your
master password.

It uses the exact same encrypted format as the Ragasiyam desktop app:
**Argon2id** key derivation (via `hash-wasm`, WASM embedded) + **AES-256-GCM**
authenticated encryption (via the browser's native WebCrypto).

## Use it

1. Open the site.
2. Choose (or drag in) your `.vault` file.
3. Enter your **master password** (or tick *Use recovery key*) and **Unlock**.
4. Search, view, copy passwords, open URLs, and **add / edit / delete** entries.
5. Click **Download vault** to save the updated, still-encrypted `.vault`
   (then put it back in OneDrive / on your device). Files created here open
   normally in the desktop app.

## Privacy

- No servers, no accounts, no tracking. Everything runs client-side.
- Your master password and decrypted entries live only in the page's memory
  until you lock or close the tab.
- Argon2's WASM is embedded in the vendored JS — the app makes **no network
  requests** at all.

## Files

```
mycro/
├─ index.html
├─ css/styles.css
├─ js/
│  ├─ vault.js     # Argon2id + AES-256-GCM, open/save (matches ragasiyam/crypto.py)
│  └─ app.js       # UI
├─ vendor/argon2.umd.min.js   # hash-wasm Argon2id (embedded WASM)
└─ assets/logo.svg
```
