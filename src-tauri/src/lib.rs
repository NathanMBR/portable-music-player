mod library;
mod portable;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            library::load_music_library,
            library::open_musics_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
