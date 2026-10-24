mod library;
mod main_window;
mod portable;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(main_window::size_memory_plugin())
        .setup(|app| main_window::show(app).map_err(Into::into))
        .invoke_handler(tauri::generate_handler![
            library::load_music_library,
            library::open_songs_folder,
            settings::load_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
