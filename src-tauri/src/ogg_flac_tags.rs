//! lofty reads no Ogg FLAC, a FLAC stream in Ogg pages: it only knows Ogg's Vorbis, Opus and
//! Speex. An Ogg FLAC's Vorbis comment and pictures come through symphonia's Ogg demuxer instead,
//! into a lofty tag, so the library reads them like an Ogg Vorbis song's.

use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
};

use lofty::{
    ogg::tag::VorbisComments,
    picture::{Picture, PictureType},
    tag::Tag,
};
use symphonia::core::{
    formats::{FormatOptions, probe::Hint},
    io::{MediaSourceStream, MediaSourceStreamOptions},
    meta::{MetadataContainer, MetadataOptions, RawTag, RawValue, StandardVisualKey, Visual},
};

/// The capture pattern every Ogg page starts with.
const OGG_CAPTURE_PATTERN: &[u8; 4] = b"OggS";
/// Where a stream's first packet starts in its first page when one segment holds it, as the
/// mapping's 51 bytes always are: past the page header's 27 bytes and its one lacing value.
const FIRST_PACKET_OFFSET: usize = 28;
/// The Ogg FLAC mapping's first packet: its type, then "FLAC".
const OGG_FLAC_SIGNATURE: &[u8; 5] = b"\x7FFLAC";

/// Whether `file` holds an Ogg FLAC stream. It's read from its start, and left there.
pub(crate) fn is_ogg_flac(file: &mut File) -> io::Result<bool> {
    let mut start = [0; FIRST_PACKET_OFFSET + OGG_FLAC_SIGNATURE.len()];
    let has_start = match file.read_exact(&mut start) {
        Ok(()) => true,
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => false,
        Err(error) => return Err(error),
    };
    file.seek(SeekFrom::Start(0))?;
    Ok(has_start
        && start.starts_with(OGG_CAPTURE_PATTERN)
        && &start[FIRST_PACKET_OFFSET..] == OGG_FLAC_SIGNATURE)
}

/// The Vorbis comment of the Ogg FLAC `file`, as a lofty tag, with its pictures when
/// `with_pictures`. `None` when symphonia can't read it.
pub(crate) fn read_ogg_flac_tag(file: File, with_pictures: bool) -> Option<Tag> {
    let source = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());
    let mut demuxer = symphonia::default::get_probe()
        .probe(
            &Hint::new(),
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .ok()?;
    let mut metadata = demuxer.metadata();
    let revision = metadata.skip_to_latest()?;
    // An Ogg stream's comment belongs to its track.
    let containers: Vec<&MetadataContainer> = std::iter::once(&revision.media)
        .chain(revision.per_track.iter().map(|track| &track.metadata))
        .collect();
    let mut comments = VorbisComments::new();
    for raw in containers.iter().flat_map(|container| &container.tags) {
        push_comment(&mut comments, &raw.raw);
    }
    let mut tag = Tag::from(comments);
    if with_pictures {
        for visual in containers.iter().flat_map(|container| &container.visuals) {
            tag.push_picture(picture_of(visual));
        }
    }
    Some(tag)
}

fn push_comment(comments: &mut VorbisComments, raw: &RawTag) {
    match &raw.value {
        RawValue::String(value) => comments.push(raw.key.clone(), value.to_string()),
        RawValue::StringList(values) => {
            for value in values.iter() {
                comments.push(raw.key.clone(), value.clone());
            }
        }
        _ => {}
    }
}

fn picture_of(visual: &Visual) -> Picture {
    let picture_type = match visual.usage {
        Some(StandardVisualKey::FrontCover) => PictureType::CoverFront,
        Some(StandardVisualKey::BackCover) => PictureType::CoverBack,
        _ => PictureType::Other,
    };
    Picture::unchecked(visual.data.to_vec())
        .pic_type(picture_type)
        .build()
}
