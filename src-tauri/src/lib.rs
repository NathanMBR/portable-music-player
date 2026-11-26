mod atomic_write;
mod crash_log;
mod library;
mod logs;
mod main_window;
mod playback;
mod playlists;
mod portable;
mod settings;
mod song_drop;
#[cfg(test)]
mod test_media;
#[cfg(test)]
mod test_songs;
mod updates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crash_log::log_crashes();
    let logs_dir = logs::writable_logs_dir();
    tauri::Builder::default()
        .plugin(logs::plugin(logs_dir.as_deref().ok()))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(main_window::size_memory_plugin())
        .manage(updates::PendingUpdate::default())
        .setup(move |app| {
            logs::log_opening(&logs_dir);
            playback::start(app)?;
            main_window::show(app).map_err(Into::into)
        })
        .invoke_handler(tauri::generate_handler![
            library::load_music_library,
            library::open_songs_folder,
            library::read_cover,
            logs::write_log,
            playback::play_song,
            playback::queue_next_song,
            playback::set_playing,
            playback::seek_song,
            playback::set_volume,
            playback::stop_playback,
            playlists::list_playlists,
            playlists::create_playlist,
            playlists::save_playlist,
            playlists::check_playlist,
            playlists::delete_playlist,
            settings::load_settings,
            settings::save_settings,
            song_drop::check_dropped_songs,
            song_drop::copy_dropped_songs,
            updates::check_for_update,
            updates::install_update
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| logs::log_closing(&event));
}
