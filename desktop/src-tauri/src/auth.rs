// Session-token storage backed by the OS credential vault (Windows Credential
// Manager, macOS Keychain, Linux Secret Service via `keyring`) instead of
// localStorage/plugin-store — a plain file on disk is readable by any process
// running as the same user, the OS vault is not.
//
// The React side never sees a filesystem path or a "where is this stored"
// detail; it only calls the three Tauri commands below (see
// src/lib/secureToken.ts). The value stored is exactly the JWT returned by
// POST /api/auth/login (see api/src/app/api/auth/login/route.ts) — this app
// never mints or inspects tokens itself, it only carries the one the backend
// issued.
use keyring::Entry;

const SERVICE: &str = "com.alasima.businesscontrolcenter";
const ACCOUNT: &str = "session-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auth_store_token(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auth_get_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        // NoEntry just means "never logged in on this machine" — not an error
        // the frontend needs to surface.
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn auth_clear_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
