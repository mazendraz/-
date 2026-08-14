// AL ASIMA Business Control Center — desktop shell.
//
// This process has NO database credentials, no Prisma, no Supabase
// service-role key — it only ever talks to the existing Al Asima API over
// HTTPS with a Bearer token (see src/lib/api.ts on the frontend side and
// api/src/lib/auth.ts on the backend). The only Rust-side responsibility is
// storing that token in the OS credential vault (see auth.rs) — everything
// else is the same React app any browser would run.
mod auth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            auth::auth_store_token,
            auth::auth_get_token,
            auth::auth_clear_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
