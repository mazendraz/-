// Thin wrapper around the three Rust commands in src-tauri/src/auth.rs. This
// is the ONLY place in the frontend that touches token storage — everything
// else goes through lib/auth.tsx. The token itself never touches
// localStorage/sessionStorage; it lives in the OS credential vault.
import { invoke } from "@tauri-apps/api/core";

export function storeToken(token: string): Promise<void> {
  return invoke("auth_store_token", { token });
}

export function getToken(): Promise<string | null> {
  return invoke("auth_get_token");
}

export function clearToken(): Promise<void> {
  return invoke("auth_clear_token");
}
