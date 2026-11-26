use std::{any::Any, cell::RefCell, marker::PhantomData, panic, path::Path};

use tauri_plugin_log::log;

thread_local! {
    /// The file name of the song this thread reads, while it reads one.
    static SONG_BEING_READ: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Has the log say what crashed the app, and which song was being read then. The release build
/// aborts on panic, so a damaged song that crashes a tag reader or a decoder closes the app, at
/// every launch if the scan reads it: the log then names the file to move away. The panic is still
/// printed as usual afterwards.
pub(crate) fn log_crashes() {
    let print_panic = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let panic = match info.location() {
            Some(location) => format!("{} ({location})", panic_text(info.payload())),
            None => panic_text(info.payload()).to_owned(),
        };
        log::error!("{}", crash_message(song_being_read().as_deref(), &panic));
        log::logger().flush();
        print_panic(info);
    }));
}

/// Notes `song` as the one this thread reads until the guard drops, for the log of a crash.
pub(crate) fn reading_song(song: &Path) -> ReadingSong {
    let file_name = song
        .file_name()
        .map(|name| name.to_string_lossy().into_owned());
    ReadingSong {
        previous: SONG_BEING_READ.with_borrow_mut(|noted| std::mem::replace(noted, file_name)),
        _bound_to_thread: PhantomData,
    }
}

/// While it lives, its thread reads a song.
pub(crate) struct ReadingSong {
    /// The song noted before, put back when this guard drops.
    previous: Option<String>,
    /// The note is the thread's own, so the guard can't move to another thread, as it would across
    /// an `await`.
    _bound_to_thread: PhantomData<*const ()>,
}

impl Drop for ReadingSong {
    fn drop(&mut self) {
        let previous = self.previous.take();
        SONG_BEING_READ.with_borrow_mut(|noted| *noted = previous);
    }
}

/// The song this thread reads. A panic can happen while the thread's storage is torn down, or in
/// the middle of a note, where nothing can be told.
fn song_being_read() -> Option<String> {
    SONG_BEING_READ
        .try_with(|noted| noted.try_borrow().ok().and_then(|song| song.clone()))
        .ok()
        .flatten()
}

fn crash_message(song: Option<&str>, panic: &str) -> String {
    match song {
        Some(song) => format!("Crashed while reading \"{song}\": {panic}"),
        None => format!("Crashed: {panic}"),
    }
}

/// What a panic said: `panic!` hands over a `&str`, or a `String` when it formats its message.
fn panic_text(payload: &(dyn Any + Send)) -> &str {
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("a panic without a message")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_song_being_read_in_the_crash_message() {
        let message = crash_message(Some("Highway Song.mp3"), "attempt to add with overflow");

        assert_eq!(
            message,
            "Crashed while reading \"Highway Song.mp3\": attempt to add with overflow"
        );
    }

    #[test]
    fn names_only_the_panic_when_no_song_is_read() {
        let message = crash_message(None, "attempt to add with overflow");

        assert_eq!(message, "Crashed: attempt to add with overflow");
    }

    #[test]
    fn notes_the_song_by_its_file_name_until_its_reading_ends() {
        let reading = reading_song(Path::new("Songs/Original Fire.mp3"));

        assert_eq!(song_being_read().as_deref(), Some("Original Fire.mp3"));
        drop(reading);
        assert_eq!(song_being_read(), None);
    }

    #[test]
    fn puts_back_the_song_read_before() {
        let _outer = reading_song(Path::new("Songs/Creeping Death.mp3"));
        let inner = reading_song(Path::new("Songs/Wide Awake.mp3"));

        drop(inner);

        assert_eq!(song_being_read().as_deref(), Some("Creeping Death.mp3"));
    }

    #[test]
    fn keeps_the_note_of_each_thread_apart() {
        let _reading = reading_song(Path::new("Songs/Highway Song.mp3"));

        let elsewhere = std::thread::spawn(song_being_read).join().unwrap();

        assert_eq!(elsewhere, None);
    }

    #[test]
    fn tells_what_any_panic_said() {
        let from_text = panic::catch_unwind(|| panic!("no frames left")).unwrap_err();
        let frames = 3;
        let from_format = panic::catch_unwind(|| panic!("{frames} frames left")).unwrap_err();

        assert_eq!(panic_text(from_text.as_ref()), "no frames left");
        assert_eq!(panic_text(from_format.as_ref()), "3 frames left");
    }
}
