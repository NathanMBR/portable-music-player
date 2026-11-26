//! The part of an MP4 song's audio track that's the song, past the priming and the padding its
//! encoder added. symphonia's MP4 demuxer reads the boxes that say it, but doesn't apply them, so
//! the decoder reads them here: the track's edit list (`moov/trak/edts/elst`), else iTunes's
//! `iTunSMPB` comment (`moov/udta/meta/ilst/----`), which Apple's encoders write instead.

use std::{
    io::{self, Read, Seek, SeekFrom},
    ops::Range,
};

type FourCc = [u8; 4];

const MOVIE: &FourCc = b"moov";
const MOVIE_HEADER: &FourCc = b"mvhd";
const TRACK: &FourCc = b"trak";
const TRACK_HEADER: &FourCc = b"tkhd";
const EDITS: &FourCc = b"edts";
const EDIT_LIST: &FourCc = b"elst";
const MEDIA: &FourCc = b"mdia";
const MEDIA_HEADER: &FourCc = b"mdhd";
const USER_DATA: &FourCc = b"udta";
const METADATA: &FourCc = b"meta";
const ITEM_LIST: &FourCc = b"ilst";
const FREEFORM_ITEM: &FourCc = b"----";
const ITEM_MEAN: &FourCc = b"mean";
const ITEM_NAME: &FourCc = b"name";
const ITEM_DATA: &FourCc = b"data";

const ITUNES_MEAN: &[u8] = b"com.apple.iTunes";
const ITUNSMPB_NAME: &[u8] = b"iTunSMPB";
/// A version and flags, which every full box starts with.
const FULL_BOX_HEADER: u64 = 4;
/// The header fields before a timescale or a track id: version 1's 64-bit creation and
/// modification times, or version 0's 32-bit ones.
const TIMES_V1: u64 = 16;
const TIMES_V0: u64 = 8;
/// An edit: its duration, its media time and its rate, in version 1's 64-bit fields or version 0's.
const EDIT_V1_LENGTH: u64 = 8 + 8 + 4;
const EDIT_V0_LENGTH: u64 = 4 + 4 + 4;
/// The type and locale before a data box's value.
const DATA_HEADER: u64 = 8;
/// More than an `iTunSMPB` value or an item's name ever takes: a larger box isn't one.
const MAX_TEXT_LENGTH: u64 = 1024;

/// The song's part of a track, in the track's own time.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Mp4Range {
    /// The timestamp of the song's first frame, in the track's timescale.
    pub(super) start_ts: i64,
    /// The song's frames, at its sample rate.
    pub(super) frames: u64,
}

/// The song's part of track `track_id` of the MP4 file `source` holds, whose sample rate is
/// `sample_rate`. `None` when its boxes don't say, or can't be read.
pub(super) fn playable_range(
    source: &mut (impl Read + Seek),
    track_id: u32,
    sample_rate: u32,
) -> Option<Mp4Range> {
    let mut reader = BoxReader { source };
    let length = reader.source.seek(SeekFrom::End(0)).ok()?;
    let movie = reader.child(&(0..length), MOVIE).ok()??;
    let track = reader.track(&movie, track_id).ok()??;
    let media_timescale = reader.media_timescale(&track).ok()??;
    let edited = reader
        .edit_list_range(&movie, &track, sample_rate)
        .ok()
        .flatten();
    edited.or_else(|| {
        reader
            .itunsmpb_range(&movie, media_timescale, sample_rate)
            .ok()
            .flatten()
    })
}

/// A box's type and where its contents are in the file.
struct Mp4Box {
    kind: FourCc,
    body: Range<u64>,
}

struct BoxReader<'a, S> {
    source: &'a mut S,
}

impl<S: Read + Seek> BoxReader<'_, S> {
    /// The boxes one after the other in `within`. A box that claims more room than there is
    /// ends the list, as a damaged file's would.
    fn boxes_in(&mut self, within: &Range<u64>) -> io::Result<Vec<Mp4Box>> {
        let mut boxes = Vec::new();
        let mut at = within.start;
        while at + 8 <= within.end {
            self.source.seek(SeekFrom::Start(at))?;
            let size = u64::from(self.u32()?);
            let kind = self.fourcc()?;
            let (header, size) = match size {
                // A 64-bit size follows the type.
                1 => (16, self.u64()?),
                // The box runs to the end of its parent.
                0 => (8, within.end - at),
                size => (8, size),
            };
            if size < header || size > within.end - at {
                break;
            }
            boxes.push(Mp4Box {
                kind,
                body: at + header..at + size,
            });
            at += size;
        }
        Ok(boxes)
    }

    fn child(&mut self, parent: &Range<u64>, kind: &FourCc) -> io::Result<Option<Range<u64>>> {
        Ok(self
            .boxes_in(parent)?
            .into_iter()
            .find(|child| child.kind == *kind)
            .map(|child| child.body))
    }

    /// The box at the end of `path`, from `parent` down.
    fn descendant(
        &mut self,
        parent: &Range<u64>,
        path: &[&FourCc],
    ) -> io::Result<Option<Range<u64>>> {
        let mut found = parent.clone();
        for kind in path {
            match self.child(&found, kind)? {
                Some(child) => found = child,
                None => return Ok(None),
            }
        }
        Ok(Some(found))
    }

    fn track(&mut self, movie: &Range<u64>, track_id: u32) -> io::Result<Option<Range<u64>>> {
        for track in self.boxes_in(movie)? {
            if track.kind != *TRACK {
                continue;
            }
            let Some(header) = self.child(&track.body, TRACK_HEADER)? else {
                continue;
            };
            if self.field_after_times(&header)? == track_id {
                return Ok(Some(track.body));
            }
        }
        Ok(None)
    }

    /// The timescale of a movie or media header, or the track id of a track header: the field
    /// after the version, the flags and the times, whose width the version sets.
    fn field_after_times(&mut self, header: &Range<u64>) -> io::Result<u32> {
        self.source.seek(SeekFrom::Start(header.start))?;
        let version = self.u8()?;
        let times = if version == 1 { TIMES_V1 } else { TIMES_V0 };
        self.source
            .seek(SeekFrom::Start(header.start + FULL_BOX_HEADER + times))?;
        self.u32()
    }

    fn media_timescale(&mut self, track: &Range<u64>) -> io::Result<Option<u32>> {
        let Some(header) = self.descendant(track, &[MEDIA, MEDIA_HEADER])? else {
            return Ok(None);
        };
        Ok(Some(self.field_after_times(&header)?).filter(|timescale| *timescale > 0))
    }

    /// The first edit that plays something: its media time, in the track's timescale, starts the
    /// song, and its duration, in the movie's, is the song's.
    fn edit_list_range(
        &mut self,
        movie: &Range<u64>,
        track: &Range<u64>,
        sample_rate: u32,
    ) -> io::Result<Option<Mp4Range>> {
        let Some(edit_list) = self.descendant(track, &[EDITS, EDIT_LIST])? else {
            return Ok(None);
        };
        let Some(movie_header) = self.child(movie, MOVIE_HEADER)? else {
            return Ok(None);
        };
        let movie_timescale = self.field_after_times(&movie_header)?;
        if movie_timescale == 0 {
            return Ok(None);
        }
        self.source.seek(SeekFrom::Start(edit_list.start))?;
        let is_64_bit = self.u8()? == 1;
        self.source
            .seek(SeekFrom::Start(edit_list.start + FULL_BOX_HEADER))?;
        // A damaged count can't send the reads past the box.
        let entry_length = if is_64_bit {
            EDIT_V1_LENGTH
        } else {
            EDIT_V0_LENGTH
        };
        let room = (edit_list.end - edit_list.start).saturating_sub(FULL_BOX_HEADER + 4);
        let entries = u64::from(self.u32()?).min(room / entry_length);
        for _ in 0..entries {
            let (duration, media_time) = if is_64_bit {
                (self.u64()?, self.u64()? as i64)
            } else {
                (u64::from(self.u32()?), i64::from(self.u32()? as i32))
            };
            // The rate, which plays the edit faster or slower, is always 1 in a song.
            self.u32()?;
            // An edit at media time -1 plays nothing: it delays the track.
            if media_time >= 0 {
                let frames = rescale(duration, sample_rate, movie_timescale);
                return Ok(Some(Mp4Range {
                    start_ts: media_time,
                    frames,
                }));
            }
        }
        Ok(None)
    }

    /// iTunes's gapless comment: hexadecimal fields, of which the second is the priming, the
    /// third the padding and the fourth the song's frames.
    fn itunsmpb_range(
        &mut self,
        movie: &Range<u64>,
        media_timescale: u32,
        sample_rate: u32,
    ) -> io::Result<Option<Mp4Range>> {
        let Some(metadata) = self.descendant(movie, &[USER_DATA, METADATA])? else {
            return Ok(None);
        };
        // An MP4 metadata box is a full box; QuickTime's isn't.
        self.source.seek(SeekFrom::Start(metadata.start))?;
        let is_full_box = self.u32()? == 0;
        let children = if is_full_box {
            metadata.start + FULL_BOX_HEADER..metadata.end
        } else {
            metadata
        };
        let Some(items) = self.child(&children, ITEM_LIST)? else {
            return Ok(None);
        };
        for item in self.boxes_in(&items)? {
            if item.kind != *FREEFORM_ITEM {
                continue;
            }
            let Some(value) = self.itunes_value(&item.body, ITUNSMPB_NAME)? else {
                continue;
            };
            let fields: Vec<u64> = String::from_utf8_lossy(&value)
                .split_whitespace()
                .map_while(|field| u64::from_str_radix(field, 16).ok())
                .collect();
            let [_, priming, _padding, frames, ..] = fields[..] else {
                return Ok(None);
            };
            let start_ts =
                i64::try_from(rescale(priming, media_timescale, sample_rate)).unwrap_or(i64::MAX);
            return Ok(Some(Mp4Range { start_ts, frames }));
        }
        Ok(None)
    }

    /// The value of a freeform item, when it's iTunes's item `name`.
    fn itunes_value(&mut self, item: &Range<u64>, name: &[u8]) -> io::Result<Option<Vec<u8>>> {
        let mut mean = None;
        let mut item_name = None;
        let mut data = None;
        for part in self.boxes_in(item)? {
            let text_start = match &part.kind {
                kind if kind == ITEM_DATA => DATA_HEADER,
                kind if kind == ITEM_MEAN || kind == ITEM_NAME => FULL_BOX_HEADER,
                _ => continue,
            };
            let text = self.text(part.body.start + text_start..part.body.end)?;
            match &part.kind {
                kind if kind == ITEM_MEAN => mean = text,
                kind if kind == ITEM_NAME => item_name = text,
                _ => data = text,
            }
        }
        let is_wanted = mean.as_deref() == Some(ITUNES_MEAN) && item_name.as_deref() == Some(name);
        Ok(data.filter(|_| is_wanted))
    }

    /// The bytes of `range`, unless it's too long to be text an item holds.
    fn text(&mut self, range: Range<u64>) -> io::Result<Option<Vec<u8>>> {
        if range.start > range.end || range.end - range.start > MAX_TEXT_LENGTH {
            return Ok(None);
        }
        self.source.seek(SeekFrom::Start(range.start))?;
        let mut text = vec![0; (range.end - range.start) as usize];
        self.source.read_exact(&mut text)?;
        Ok(Some(text))
    }

    fn u8(&mut self) -> io::Result<u8> {
        Ok(self.bytes::<1>()?[0])
    }

    fn u32(&mut self) -> io::Result<u32> {
        Ok(u32::from_be_bytes(self.bytes()?))
    }

    fn u64(&mut self) -> io::Result<u64> {
        Ok(u64::from_be_bytes(self.bytes()?))
    }

    fn fourcc(&mut self) -> io::Result<FourCc> {
        self.bytes()
    }

    fn bytes<const LENGTH: usize>(&mut self) -> io::Result<[u8; LENGTH]> {
        let mut bytes = [0; LENGTH];
        self.source.read_exact(&mut bytes)?;
        Ok(bytes)
    }
}

/// `value` ticks of a clock at `from` per second, in ticks of one at `to`, rounded to the nearest.
fn rescale(value: u64, to: u32, from: u32) -> u64 {
    let scaled = (u128::from(value) * u128::from(to) + u128::from(from) / 2) / u128::from(from);
    u64::try_from(scaled).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;
    use crate::test_media::{AAC_M4A_FIXTURE, FIXTURE_FRAMES, aac_m4a_with_itunsmpb};

    const TRACK_ID: u32 = 1;
    const SAMPLE_RATE: u32 = 44_100;

    fn range_of(song: &[u8]) -> Option<Mp4Range> {
        playable_range(&mut Cursor::new(song), TRACK_ID, SAMPLE_RATE)
    }

    #[test]
    fn reads_the_range_of_the_edit_list() {
        assert_eq!(
            range_of(AAC_M4A_FIXTURE),
            Some(Mp4Range {
                start_ts: 1024,
                frames: FIXTURE_FRAMES
            })
        );
    }

    #[test]
    fn reads_the_range_of_itunsmpb_without_an_edit_list() {
        assert_eq!(
            range_of(&aac_m4a_with_itunsmpb()),
            Some(Mp4Range {
                start_ts: 1024,
                frames: FIXTURE_FRAMES
            })
        );
    }

    #[test]
    fn finds_no_range_for_another_track() {
        let range = playable_range(&mut Cursor::new(AAC_M4A_FIXTURE), 7, SAMPLE_RATE);

        assert_eq!(range, None);
    }

    #[test]
    fn never_panics_on_a_damaged_file() {
        for length in (0..AAC_M4A_FIXTURE.len()).step_by(61) {
            range_of(&AAC_M4A_FIXTURE[..length]);
        }
        for at in (0..AAC_M4A_FIXTURE.len()).step_by(7) {
            for damage in [0x00, 0xFF, 0x7F] {
                let mut song = AAC_M4A_FIXTURE.to_vec();
                song[at] = damage;
                range_of(&song);
            }
        }
    }
}
