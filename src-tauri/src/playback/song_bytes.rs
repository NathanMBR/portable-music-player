use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use crate::library::{self, LibraryError};

/// How much of the file one read from the drive takes in.
pub(super) const READ_CHUNK_BYTES: usize = 64 * 1024;

/// A song's file, read into memory as its decoder asks for it, and in the background in between:
/// a song starts once its first frames are read, not the whole file, and plays on from memory once
/// it's all in, even if the drive goes away.
pub(super) struct SongBytes {
    loaded: Mutex<Loaded>,
    length: u64,
}

struct Loaded {
    /// The file, until all of it is in memory or a read fails.
    file: Option<File>,
    /// The file's start, as far as it was read. Allocated at the file's length, so it never moves.
    bytes: Vec<u8>,
    /// What went wrong in a read from the drive: later reads fail the same way at once.
    failure: Option<io::ErrorKind>,
}

impl SongBytes {
    /// Opens the song a `Track::path` points to, in `root`'s Songs folder.
    pub(super) fn open(root: &Path, track_path: &str) -> Result<Arc<Self>, LibraryError> {
        let song = library::find_song_in(root, track_path)?;
        let read_error = |source| LibraryError::ReadSong {
            path: track_path.to_owned(),
            source,
        };
        let file = File::open(song).map_err(read_error)?;
        let length = file.metadata().map_err(read_error)?.len();
        let bytes = Vec::with_capacity(usize::try_from(length).unwrap_or_default());
        Ok(Arc::new(Self {
            loaded: Mutex::new(Loaded {
                file: Some(file),
                bytes,
                failure: None,
            }),
            length,
        }))
    }

    pub(super) fn length(&self) -> u64 {
        self.length
    }

    /// A reader of the song from its start, for its decoder.
    pub(super) fn reader(self: &Arc<Self>) -> SongReader {
        SongReader {
            bytes: Arc::clone(self),
            position: 0,
        }
    }

    /// Reads one more chunk of the file into memory. `false` once it's all in.
    pub(super) fn load_more(&self) -> io::Result<bool> {
        self.lock().load_chunk(self.length)
    }

    /// Copies the bytes at `position` into `buffer`, after reading them from the drive if they
    /// aren't in memory yet. Bytes already in memory are still read after the drive failed.
    fn read_at(&self, position: u64, buffer: &mut [u8]) -> io::Result<usize> {
        let mut loaded = self.lock();
        let end = position
            .saturating_add(buffer.len() as u64)
            .min(self.length);
        let loading = loaded.load_up_to(end, self.length);
        let start = usize::try_from(position).map_or(loaded.bytes.len(), |position| {
            position.min(loaded.bytes.len())
        });
        let available = &loaded.bytes[start..];
        if available.is_empty() {
            loading?;
        }
        let count = available.len().min(buffer.len());
        buffer[..count].copy_from_slice(&available[..count]);
        Ok(count)
    }

    fn lock(&self) -> MutexGuard<'_, Loaded> {
        // Only a panic poisons the lock, and the bytes it guards are still whole.
        self.loaded.lock().unwrap_or_else(PoisonError::into_inner)
    }

    #[cfg(test)]
    fn loaded_length(&self) -> usize {
        self.lock().bytes.len()
    }
}

impl Loaded {
    fn load_up_to(&mut self, end: u64, length: u64) -> io::Result<()> {
        while (self.bytes.len() as u64) < end && self.load_chunk(length)? {}
        Ok(())
    }

    /// Reads the next chunk of the file. `false` once it's all in, which lets the file go.
    fn load_chunk(&mut self, length: u64) -> io::Result<bool> {
        if let Some(kind) = self.failure {
            return Err(kind.into());
        }
        let Some(file) = self.file.as_mut() else {
            return Ok(false);
        };
        let left = length.saturating_sub(self.bytes.len() as u64);
        let chunk = left.min(READ_CHUNK_BYTES as u64);
        match file.by_ref().take(chunk).read_to_end(&mut self.bytes) {
            // A file cut short since it was opened ends where it now ends.
            Ok(count) if count > 0 && (self.bytes.len() as u64) < length => Ok(true),
            Ok(_) => {
                self.file = None;
                Ok(false)
            }
            Err(error) => {
                self.failure = Some(error.kind());
                self.file = None;
                Err(error)
            }
        }
    }
}

/// Reads a song's bytes from a position of its own, loading them from the drive first when they
/// aren't in memory yet.
pub(super) struct SongReader {
    bytes: Arc<SongBytes>,
    position: u64,
}

impl Read for SongReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let count = self.bytes.read_at(self.position, buffer)?;
        self.position += count as u64;
        Ok(count)
    }
}

impl Seek for SongReader {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let position = match to {
            SeekFrom::Start(position) => Some(position),
            SeekFrom::End(offset) => self.bytes.length.checked_add_signed(offset),
            SeekFrom::Current(offset) => self.position.checked_add_signed(offset),
        }
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "can't seek before the start of the song",
            )
        })?;
        self.position = position;
        Ok(position)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_songs::root_with_songs;

    /// Bytes that differ from their neighbours, so a read from the wrong place shows.
    fn numbered_bytes(length: usize) -> Vec<u8> {
        (0..length).map(|index| (index % 251) as u8).collect()
    }

    fn read_all(reader: &mut SongReader) -> Vec<u8> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn reads_the_song_in_the_songs_folder() {
        let contents = numbered_bytes(200_000);
        let root = root_with_songs(&[("Whiplash.mp3", &contents)]);

        let bytes = SongBytes::open(root.path(), "Songs/Whiplash.mp3").unwrap();

        assert_eq!(bytes.length(), 200_000);
        assert_eq!(read_all(&mut bytes.reader()), contents);
    }

    #[test]
    fn refuses_a_path_outside_the_songs_folder() {
        let root = root_with_songs(&[("Your Time Has Come.mp3", b"")]);

        let result = SongBytes::open(root.path(), "Songs/../Songs/Your Time Has Come.mp3");

        assert!(matches!(result, Err(LibraryError::NotASong { .. })));
    }

    #[test]
    fn refuses_a_song_that_isnt_there() {
        let root = root_with_songs(&[]);

        let result = SongBytes::open(root.path(), "Songs/Deer Dance.mp3");

        assert!(matches!(result, Err(LibraryError::SongMissing { .. })));
    }

    #[test]
    fn reads_only_what_was_asked_for() {
        let contents = numbered_bytes(1024 * 1024);
        let root = root_with_songs(&[("Drown Me Slowly.mp3", &contents)]);
        let bytes = SongBytes::open(root.path(), "Songs/Drown Me Slowly.mp3").unwrap();

        let mut start = [0; 100];
        bytes.reader().read_exact(&mut start).unwrap();

        assert_eq!(start, contents[..100]);
        assert_eq!(bytes.loaded_length(), READ_CHUNK_BYTES);
    }

    #[test]
    fn reads_the_rest_in_the_background() {
        let contents = numbered_bytes(3 * READ_CHUNK_BYTES + 10);
        let root = root_with_songs(&[("Arising Thunder.mp3", &contents)]);
        let bytes = SongBytes::open(root.path(), "Songs/Arising Thunder.mp3").unwrap();

        assert!(bytes.load_more().unwrap());
        assert_eq!(bytes.loaded_length(), READ_CHUNK_BYTES);
        while bytes.load_more().unwrap() {}

        assert_eq!(bytes.loaded_length(), contents.len());
        assert!(!bytes.load_more().unwrap());
        assert_eq!(read_all(&mut bytes.reader()), contents);
    }

    #[test]
    fn seeks_anywhere_in_the_song() {
        let contents = numbered_bytes(1024 * 1024);
        let root = root_with_songs(&[("Damage Inc..mp3", &contents)]);
        let bytes = SongBytes::open(root.path(), "Songs/Damage Inc..mp3").unwrap();
        let mut reader = bytes.reader();
        let mut part = [0; 10];

        reader.seek(SeekFrom::Start(900_000)).unwrap();
        reader.read_exact(&mut part).unwrap();
        assert_eq!(part, contents[900_000..900_010]);

        reader.seek(SeekFrom::Current(-20)).unwrap();
        reader.read_exact(&mut part).unwrap();
        assert_eq!(part, contents[899_990..900_000]);

        reader.seek(SeekFrom::End(-10)).unwrap();
        reader.read_exact(&mut part).unwrap();
        assert_eq!(part, contents[contents.len() - 10..]);
    }

    #[test]
    fn refuses_to_seek_before_the_start() {
        let root = root_with_songs(&[("The Shaman.mp3", &numbered_bytes(100))]);
        let bytes = SongBytes::open(root.path(), "Songs/The Shaman.mp3").unwrap();

        let result = bytes.reader().seek(SeekFrom::Current(-1));

        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidInput);
    }
}
