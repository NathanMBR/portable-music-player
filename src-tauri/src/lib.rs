mod library;
mod logs;
mod main_window;
mod portable;
mod settings;
mod song_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let logs_dir = logs::writable_logs_dir();
    tauri::Builder::default()
        .plugin(logs::plugin(logs_dir.as_deref().ok()))
        .plugin(tauri_plugin_opener::init())
        .plugin(main_window::size_memory_plugin())
        .manage(song_server::LazySongServer::default())
        .setup(move |app| {
            logs::warn_if_unsaved(&logs_dir);
            main_window::show(app).map_err(Into::into)
        })
        .invoke_handler(tauri::generate_handler![
            library::load_music_library,
            library::open_songs_folder,
            library::song_source,
            library::read_song,
            library::read_cover,
            settings::load_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
