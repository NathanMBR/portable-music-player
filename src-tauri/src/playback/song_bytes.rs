use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use crate::library::{self, LibraryError};

/// How much of the file one read from the drive takes in.
pub(super) const READ_CHUNK_BYTES: usize = 64 * 1024;
const MEBIBYTE: u64 = 1024 * 1024;
/// How much of a song's file is kept in memory. Nearly every song is kept whole: a 5-minute 24/96
/// FLAC is about 100 MB. Two songs are in the player at most, the current one and the queued one.
pub(super) const MEMORY_LIMITS: MemoryLimits = MemoryLimits {
    whole_file: 128 * MEBIBYTE,
    read_ahead: 16 * MEBIBYTE,
    keep_behind: 4 * MEBIBYTE,
};

/// How much of a song's file is kept in memory.
#[derive(Clone, Copy, Debug)]
pub(super) struct MemoryLimits {
    /// A file up to this size is read whole and kept, so it plays on once the drive is pulled.
    pub(super) whole_file: u64,
    /// How far ahead of each reader a larger file is read: about 14 s of a 24/192 WAV, enough to
    /// ride out a slow drive.
    pub(super) read_ahead: u64,
    /// How much of a larger file is kept behind each reader, for a demuxer's steps back.
    pub(super) keep_behind: u64,
}

/// A song's file, read into memory in chunks as its decoder asks for them, and in the background
/// in between: a song starts once the chunks it needs are read, wherever they are in the file, and
/// a song that's kept whole plays on from memory once it's all in, even if the drive goes away. A
/// longer song keeps only the chunks around its readers.
pub(super) struct SongBytes {
    loaded: Mutex<Loaded>,
    length: u64,
    limits: MemoryLimits,
}

struct Loaded {
    /// The file, until all of it is in memory or a read fails.
    file: Option<File>,
    /// The file's chunks, each read once it's needed, and let go again when a longer song's
    /// readers have moved away from it.
    chunks: Vec<Option<Box<[u8]>>>,
    held_bytes: usize,
    /// Where each reader of the song last read, by its slot. A slot is free once its reader drops.
    readers: Vec<Option<u64>>,
    /// The first chunk a song kept whole may still miss: the ones before it are all in.
    next_missing: usize,
    /// What went wrong in a read from the drive: later reads fail the same way at once.
    failure: Option<io::ErrorKind>,
}

impl SongBytes {
    /// Opens the song a `Track::path` points to, in `root`'s Songs folder.
    pub(super) fn open(root: &Path, track_path: &str) -> Result<Arc<Self>, LibraryError> {
        Self::open_with(root, track_path, MEMORY_LIMITS)
    }

    pub(super) fn open_with(
        root: &Path,
        track_path: &str,
        limits: MemoryLimits,
    ) -> Result<Arc<Self>, LibraryError> {
        let song = library::find_song_in(root, track_path)?;
        let read_error = |source| LibraryError::ReadSong {
            path: track_path.to_owned(),
            source,
        };
        let file = File::open(song).map_err(read_error)?;
        let length = file.metadata().map_err(read_error)?.len();
        let chunk_count = usize::try_from(length.div_ceil(READ_CHUNK_BYTES as u64)).unwrap_or(0);
        Ok(Arc::new(Self {
            loaded: Mutex::new(Loaded {
                file: Some(file),
                chunks: (0..chunk_count).map(|_| None).collect(),
                held_bytes: 0,
                readers: Vec::new(),
                next_missing: 0,
                failure: None,
            }),
            length,
            limits,
        }))
    }

    pub(super) fn length(&self) -> u64 {
        self.length
    }

    /// A reader of the song from its start, for its decoder.
    pub(super) fn reader(self: &Arc<Self>) -> SongReader {
        let slot = self.lock().take_reader_slot();
        SongReader {
            bytes: Arc::clone(self),
            position: 0,
            slot,
        }
    }

    /// Reads one more chunk of the file into memory: the next one missing of a song kept whole, or
    /// of the read-ahead of a longer song's readers. `false` when there's none to read for now.
    pub(super) fn load_more(&self) -> io::Result<bool> {
        let mut loaded = self.lock();
        if let Some(kind) = loaded.failure {
            return Err(kind.into());
        }
        let missing = if self.is_kept_whole() {
            loaded.next_missing_chunk()
        } else {
            loaded.missing_chunk_ahead(self.limits.read_ahead)
        };
        let Some(index) = missing else {
            if self.is_kept_whole() {
                loaded.file = None;
            }
            return Ok(false);
        };
        self.load_chunk(&mut loaded, index)?;
        Ok(true)
    }

    fn is_kept_whole(&self) -> bool {
        self.length <= self.limits.whole_file
    }

    /// Copies the bytes at `position` into `buffer`, after reading their chunk from the drive if
    /// it isn't in memory. Chunks in memory are still read after the drive failed.
    fn read_at(&self, slot: usize, position: u64, buffer: &mut [u8]) -> io::Result<usize> {
        if position >= self.length || buffer.is_empty() {
            return Ok(0);
        }
        let mut loaded = self.lock();
        loaded.readers[slot] = Some(position);
        let index = chunk_index(position);
        if loaded.chunks[index].is_none() {
            self.load_chunk(&mut loaded, index)?;
        }
        let chunk = loaded.chunks[index].as_deref().unwrap_or_default();
        let offset = (position - chunk_start(index)) as usize;
        // A file cut short since it was opened ends where it now ends.
        let available = chunk.get(offset..).unwrap_or_default();
        let count = available.len().min(buffer.len());
        buffer[..count].copy_from_slice(&available[..count]);
        loaded.readers[slot] = Some(position + count as u64);
        Ok(count)
    }

    /// Reads chunk `index` from the drive, then lets go of a longer song's chunks its readers
    /// moved away from.
    fn load_chunk(&self, loaded: &mut Loaded, index: usize) -> io::Result<()> {
        let chunk_length = (self.length - chunk_start(index)).min(READ_CHUNK_BYTES as u64) as usize;
        let chunk = loaded.read_chunk(index, chunk_length)?;
        loaded.held_bytes += chunk.len();
        loaded.chunks[index] = Some(chunk);
        if !self.is_kept_whole() {
            loaded.let_go_outside_windows(self.limits);
        }
        Ok(())
    }

    fn lock(&self) -> MutexGuard<'_, Loaded> {
        // Only a panic poisons the lock, and the chunks it guards are still whole.
        self.loaded.lock().unwrap_or_else(PoisonError::into_inner)
    }

    #[cfg(test)]
    pub(super) fn loaded_length(&self) -> usize {
        self.lock().held_bytes
    }
}

impl Loaded {
    fn take_reader_slot(&mut self) -> usize {
        if let Some(slot) = self.readers.iter().position(Option::is_none) {
            self.readers[slot] = Some(0);
            return slot;
        }
        self.readers.push(Some(0));
        self.readers.len() - 1
    }

    fn next_missing_chunk(&mut self) -> Option<usize> {
        while self
            .chunks
            .get(self.next_missing)
            .is_some_and(Option::is_some)
        {
            self.next_missing += 1;
        }
        (self.next_missing < self.chunks.len()).then_some(self.next_missing)
    }

    fn missing_chunk_ahead(&self, read_ahead: u64) -> Option<usize> {
        self.readers.iter().flatten().find_map(|&position| {
            let first = chunk_index(position);
            let last = chunk_index(position.saturating_add(read_ahead)).min(self.chunks.len());
            (first..last).find(|&index| self.chunks[index].is_none())
        })
    }

    fn let_go_outside_windows(&mut self, limits: MemoryLimits) {
        let windows: Vec<(u64, u64)> = self
            .readers
            .iter()
            .flatten()
            .map(|&position| {
                (
                    position.saturating_sub(limits.keep_behind),
                    position.saturating_add(limits.read_ahead),
                )
            })
            .collect();
        for (index, chunk) in self.chunks.iter_mut().enumerate() {
            let start = chunk_start(index);
            let end = start + READ_CHUNK_BYTES as u64;
            let is_in_a_window = windows
                .iter()
                .any(|&(window_start, window_end)| start < window_end && window_start < end);
            if !is_in_a_window && let Some(released) = chunk.take() {
                self.held_bytes -= released.len();
            }
        }
    }

    /// The chunk at `index` from the drive, or as much of it as the file still holds.
    fn read_chunk(&mut self, index: usize, chunk_length: usize) -> io::Result<Box<[u8]>> {
        if let Some(kind) = self.failure {
            return Err(kind.into());
        }
        let Some(file) = self.file.as_mut() else {
            return Err(io::ErrorKind::NotFound.into());
        };
        let mut chunk = Vec::with_capacity(chunk_length);
        let read = file
            .seek(SeekFrom::Start(chunk_start(index)))
            .and_then(|_| {
                file.by_ref()
                    .take(chunk_length as u64)
                    .read_to_end(&mut chunk)
            });
        match read {
            Ok(_) => Ok(chunk.into_boxed_slice()),
            Err(error) => {
                self.failure = Some(error.kind());
                self.file = None;
                Err(error)
            }
        }
    }
}

fn chunk_index(position: u64) -> usize {
    usize::try_from(position / READ_CHUNK_BYTES as u64).unwrap_or(usize::MAX)
}

fn chunk_start(index: usize) -> u64 {
    index as u64 * READ_CHUNK_BYTES as u64
}

/// Reads a song's bytes from a position of its own, loading them from the drive first when they
/// aren't in memory.
pub(super) struct SongReader {
    bytes: Arc<SongBytes>,
    position: u64,
    /// Its place among the song's readers, whose positions keep a longer song's chunks around.
    slot: usize,
}

impl SongReader {
    pub(super) fn length(&self) -> u64 {
        self.bytes.length()
    }
}

impl Read for SongReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let count = self.bytes.read_at(self.slot, self.position, buffer)?;
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

impl Drop for SongReader {
    fn drop(&mut self) {
        self.bytes.lock().readers[self.slot] = None;
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

    /// Small enough for a test file of a few MB to count as a long song.
    const TEST_LIMITS: MemoryLimits = MemoryLimits {
        whole_file: 1024 * 1024,
        read_ahead: 4 * READ_CHUNK_BYTES as u64,
        keep_behind: 2 * READ_CHUNK_BYTES as u64,
    };
    /// What a long song may hold at most: its window around the reader, plus the chunk at each of
    /// its ends that the window only partly covers.
    const MOST_HELD: usize =
        (TEST_LIMITS.read_ahead + TEST_LIMITS.keep_behind) as usize + 2 * READ_CHUNK_BYTES;

    fn long_song(file_name: &str, length: usize) -> (tempfile::TempDir, Vec<u8>, Arc<SongBytes>) {
        let contents = numbered_bytes(length);
        let root = root_with_songs(&[(file_name, &contents)]);
        let bytes =
            SongBytes::open_with(root.path(), &format!("Songs/{file_name}"), TEST_LIMITS).unwrap();
        (root, contents, bytes)
    }

    #[test]
    fn reads_only_the_chunks_asked_for() {
        let contents = numbered_bytes(1024 * 1024);
        let root = root_with_songs(&[("Lasting Child.mp3", &contents)]);
        let bytes = SongBytes::open(root.path(), "Songs/Lasting Child.mp3").unwrap();
        let mut reader = bytes.reader();
        let mut end = [0; 100];

        reader.seek(SeekFrom::End(-100)).unwrap();
        reader.read_exact(&mut end).unwrap();

        assert_eq!(end, contents[contents.len() - 100..]);
        assert_eq!(bytes.loaded_length(), READ_CHUNK_BYTES);
    }

    #[test]
    fn keeps_only_a_window_of_a_long_song_around_its_reader() {
        let (_root, contents, bytes) = long_song("Awake from Darkness.mp3", 4 * 1024 * 1024);
        let mut reader = bytes.reader();
        let mut read = Vec::new();
        let mut piece = [0; 10_000];
        let mut most_held = 0;

        loop {
            let count = reader.read(&mut piece).unwrap();
            if count == 0 {
                break;
            }
            read.extend_from_slice(&piece[..count]);
            while bytes.load_more().unwrap() {}
            most_held = most_held.max(bytes.loaded_length());
        }

        assert!(read == contents, "read other bytes than the file's");
        assert!(most_held <= MOST_HELD, "held {most_held} bytes");
    }

    #[test]
    fn reads_a_long_song_ahead_only_as_far_as_its_window() {
        let (_root, _contents, bytes) =
            long_song("Horizons into Battlegrounds.mp3", 4 * 1024 * 1024);
        let mut start = [0; 100];
        bytes.reader().read_exact(&mut start).unwrap();
        let reader = bytes.reader();

        while bytes.load_more().unwrap() {}

        assert!(
            bytes.loaded_length() <= MOST_HELD,
            "held {}",
            bytes.loaded_length()
        );
        drop(reader);
    }

    #[test]
    fn reads_a_let_go_chunk_of_a_long_song_again() {
        let (_root, contents, bytes) = long_song("Creeping Death.mp3", 4 * 1024 * 1024);
        let mut reader = bytes.reader();
        let mut piece = [0; 100];
        reader.seek(SeekFrom::End(-100)).unwrap();
        reader.read_exact(&mut piece).unwrap();
        while bytes.load_more().unwrap() {}

        reader.seek(SeekFrom::Start(0)).unwrap();
        reader.read_exact(&mut piece).unwrap();

        assert_eq!(piece, contents[..100]);
    }

    #[test]
    fn keeps_the_window_of_each_reader_of_a_long_song() {
        let (_root, contents, bytes) = long_song("Lasting Child.mp3", 4 * 1024 * 1024);
        let mut current = bytes.reader();
        let mut next = bytes.reader();
        let mut piece = [0; 100];
        current.seek(SeekFrom::Start(3 * 1024 * 1024)).unwrap();
        current.read_exact(&mut piece).unwrap();
        next.read_exact(&mut piece).unwrap();

        while bytes.load_more().unwrap() {}

        let both_read_aheads = 2 * TEST_LIMITS.read_ahead as usize;
        assert!(
            bytes.loaded_length() >= both_read_aheads,
            "only one window held"
        );
        assert!(
            bytes.loaded_length() <= 2 * MOST_HELD,
            "held {}",
            bytes.loaded_length()
        );
        assert_eq!(piece, contents[..100]);
    }

    #[test]
    fn refuses_to_seek_before_the_start() {
        let root = root_with_songs(&[("The Shaman.mp3", &numbered_bytes(100))]);
        let bytes = SongBytes::open(root.path(), "Songs/The Shaman.mp3").unwrap();

        let result = bytes.reader().seek(SeekFrom::Current(-1));

        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidInput);
    }
}
