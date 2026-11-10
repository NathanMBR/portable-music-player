use std::{
    fs::File,
    io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write},
    net::{Ipv4Addr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, PoisonError},
    thread,
    time::Duration,
};

use crate::library;

/// Only programs on this computer can reach the server.
const LOOPBACK: Ipv4Addr = Ipv4Addr::LOCALHOST;
/// Port 0 lets the system pick a free port.
const ANY_FREE_PORT: u16 = 0;
/// The length of the random secret in every song URL, which keeps other programs on this computer
/// from fetching songs from the server.
const TOKEN_BYTES: usize = 16;
/// How long a connection may take to send its request before it's dropped.
const REQUEST_HEAD_TIMEOUT: Duration = Duration::from_secs(10);
/// No request of the webview comes close to this.
const MAX_REQUEST_HEAD_BYTES: u64 = 16 * 1024;
/// The wait before accepting again after a failure, so a lasting one doesn't keep a core busy.
const ACCEPT_RETRY_PAUSE: Duration = Duration::from_millis(100);
const SERVER_THREAD_NAME: &str = "song-server";
const GET_METHOD: &str = "GET";
const RANGE_HEADER: &str = "Range";
const BYTES_UNIT: &str = "bytes=";
// Every song of the library is an MP3.
const SONG_CONTENT_TYPE: &str = "audio/mpeg";

const OK: &str = "200 OK";
const PARTIAL_CONTENT: &str = "206 Partial Content";
const BAD_REQUEST: &str = "400 Bad Request";
const NOT_FOUND: &str = "404 Not Found";
const METHOD_NOT_ALLOWED: &str = "405 Method Not Allowed";
const RANGE_NOT_SATISFIABLE: &str = "416 Range Not Satisfiable";

/// Streams the songs of the Songs folder to the webview over HTTP, reachable from this computer
/// only. Linux needs it: WebKitGTK 2.48+ plays songs over 2 MiB wrong from blob URLs, skipping ahead
/// while the timer keeps counting, and can't play media from custom URI schemes at all.
#[derive(Clone)]
pub struct SongServer {
    /// `http://127.0.0.1:<port>/<token>`: what every song URL starts with.
    base_url: String,
}

impl SongServer {
    /// Starts serving the songs of `root`'s Songs folder on a free port, from threads of its own.
    pub fn start(root: PathBuf) -> io::Result<Self> {
        let listener = TcpListener::bind((LOOPBACK, ANY_FREE_PORT))?;
        let address = listener.local_addr()?;
        let access = Arc::new(SongAccess {
            root,
            token: new_token()?,
        });
        let base_url = format!("http://{address}/{}", access.token);
        thread::Builder::new()
            .name(SERVER_THREAD_NAME.to_owned())
            .spawn(move || accept_connections(&listener, &access))?;
        Ok(Self { base_url })
    }

    /// The URL the webview plays a track from.
    pub fn url_of(&self, track_path: &str) -> String {
        format!("{}/{}", self.base_url, encode_hex(track_path.as_bytes()))
    }
}

/// The song server, started with the first song that streams and kept until the app quits.
#[derive(Default)]
pub struct LazySongServer(Mutex<Option<SongServer>>);

impl LazySongServer {
    /// The running server, started first if there's none yet. A failed start is tried again on the
    /// next call.
    pub fn get_or_start(&self, root: &Path) -> io::Result<SongServer> {
        // Only a panic poisons the lock, and the server it guards is still whole.
        let mut server = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(server) = server.as_ref() {
            return Ok(server.clone());
        }
        Ok(server
            .insert(SongServer::start(root.to_path_buf())?)
            .clone())
    }
}

/// What every request needs to reach a song.
struct SongAccess {
    root: PathBuf,
    token: String,
}

/// The parts of a request the server looks at.
struct Request {
    method: String,
    target: String,
    range: Option<String>,
}

fn new_token() -> io::Result<String> {
    let mut bytes = [0; TOKEN_BYTES];
    getrandom::fill(&mut bytes).map_err(io::Error::other)?;
    Ok(encode_hex(&bytes))
}

fn accept_connections(listener: &TcpListener, access: &Arc<SongAccess>) {
    for connection in listener.incoming() {
        match connection {
            Ok(stream) => answer_in_thread(stream, Arc::clone(access)),
            // Only that connection is lost: the webview asks again.
            Err(_) => thread::sleep(ACCEPT_RETRY_PAUSE),
        }
    }
}

/// Each connection gets a thread: sending a song takes as long as the webview takes to read it.
fn answer_in_thread(stream: TcpStream, access: Arc<SongAccess>) {
    // Without a thread the connection closes unanswered, and the webview reports the song it
    // couldn't load.
    let _ = thread::Builder::new()
        .name(SERVER_THREAD_NAME.to_owned())
        .spawn(move || answer(stream, &access));
}

fn answer(mut stream: TcpStream, access: &SongAccess) {
    // Failing here means the webview let go of the song (a seek, Stop, another song) or sent
    // something that isn't a request. Nobody waits for the rest either way, so the connection
    // just ends.
    let _ = respond(&mut stream, access);
}

fn respond(stream: &mut TcpStream, access: &SongAccess) -> io::Result<()> {
    stream.set_read_timeout(Some(REQUEST_HEAD_TIMEOUT))?;
    let Some(request) = read_request(stream)? else {
        return write_empty(stream, BAD_REQUEST, &[]);
    };
    if request.method != GET_METHOD {
        return write_empty(
            stream,
            METHOD_NOT_ALLOWED,
            &[format!("Allow: {GET_METHOD}")],
        );
    }
    let Some(mut song) = open_song(&request.target, access) else {
        return write_empty(stream, NOT_FOUND, &[]);
    };
    let size = song.metadata()?.len();
    let range = byte_range(request.range.as_deref(), size);
    send_song(stream, &mut song, size, range)
}

/// Reads a request's head. `None` when it isn't one: no request line, or no end to its headers.
fn read_request(stream: &TcpStream) -> io::Result<Option<Request>> {
    let mut reader = BufReader::new(stream.take(MAX_REQUEST_HEAD_BYTES));
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    let mut words = request_line.split_whitespace();
    let (Some(method), Some(target), Some(_version)) = (words.next(), words.next(), words.next())
    else {
        return Ok(None);
    };

    let mut range = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':')
            && name.trim().eq_ignore_ascii_case(RANGE_HEADER)
        {
            range = Some(value.trim().to_owned());
        }
    }
    Ok(Some(Request {
        method: method.to_owned(),
        target: target.to_owned(),
        range,
    }))
}

/// The song a request target points to, if its token is right and the song is one of the Songs
/// folder: the same check `song_source` makes, so the server never reaches any other file.
fn open_song(target: &str, access: &SongAccess) -> Option<File> {
    let track_path = track_path_in(target, &access.token)?;
    let song = library::find_song_in(&access.root, &track_path).ok()?;
    File::open(song).ok()
}

fn send_song(
    stream: &mut TcpStream,
    song: &mut File,
    size: u64,
    range: ByteRange,
) -> io::Result<()> {
    let (status, first, length, content_range) = match range {
        ByteRange::Whole => (OK, 0, size, None),
        ByteRange::Part { first, last } => (
            PARTIAL_CONTENT,
            first,
            last - first + 1,
            Some(format!("Content-Range: bytes {first}-{last}/{size}")),
        ),
        ByteRange::Unsatisfiable => {
            return write_empty(
                stream,
                RANGE_NOT_SATISFIABLE,
                &[format!("Content-Range: bytes */{size}")],
            );
        }
    };
    let mut headers = vec![
        format!("Content-Type: {SONG_CONTENT_TYPE}"),
        format!("Content-Length: {length}"),
        "Accept-Ranges: bytes".to_owned(),
        // Keeps the webview from storing songs in its cache, on the computer instead of the drive.
        "Cache-Control: no-store".to_owned(),
    ];
    headers.extend(content_range);
    write_head(stream, status, &headers)?;
    song.seek(SeekFrom::Start(first))?;
    io::copy(&mut song.take(length), stream)?;
    Ok(())
}

/// Writes a response's status line and headers. Each connection serves a single request, so every
/// response closes it.
fn write_head(stream: &mut impl Write, status: &str, headers: &[String]) -> io::Result<()> {
    let mut head = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
    for header in headers {
        head.push_str(header);
        head.push_str("\r\n");
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())
}

fn write_empty(stream: &mut impl Write, status: &str, headers: &[String]) -> io::Result<()> {
    let mut headers = headers.to_vec();
    headers.push("Content-Length: 0".to_owned());
    write_head(stream, status, &headers)
}

/// Which bytes of a song a request asks for, given the `Range` header it sent.
#[derive(Debug, PartialEq, Eq)]
enum ByteRange {
    Whole,
    /// From `first` to `last`, both included.
    Part {
        first: u64,
        last: u64,
    },
    Unsatisfiable,
}

/// The bytes a `Range` header asks for in a song of `size` bytes. Only a single range of bytes is
/// handled: for anything else a server may ignore the header and send the whole song.
fn byte_range(header: Option<&str>, size: u64) -> ByteRange {
    let Some(spec) = header.and_then(|value| value.trim().strip_prefix(BYTES_UNIT)) else {
        return ByteRange::Whole;
    };
    // Several ranges would take a multipart answer.
    if spec.contains(',') {
        return ByteRange::Whole;
    }
    let Some((first, last)) = spec.split_once('-') else {
        return ByteRange::Whole;
    };
    let (first, last) = (first.trim(), last.trim());
    match (first.parse::<u64>().ok(), last.parse::<u64>().ok()) {
        (Some(first), Some(last)) if first <= last => part_of(size, first, last),
        (Some(first), None) if last.is_empty() => part_of(size, first, u64::MAX),
        // `bytes=-n` asks for the last n bytes.
        (None, Some(suffix)) if first.is_empty() => {
            part_of(size, size.saturating_sub(suffix), u64::MAX)
        }
        _ => ByteRange::Whole,
    }
}

/// The bytes from `first` to `last` of a song of `size` bytes, cut at its end.
fn part_of(size: u64, first: u64, last: u64) -> ByteRange {
    if first >= size {
        return ByteRange::Unsatisfiable;
    }
    ByteRange::Part {
        first,
        last: last.min(size - 1),
    }
}

/// The track path a request target carries, if it's `/<token>/<the track path in hex>`. Hex keeps
/// the path out of reach of URL normalization: it's only letters and digits.
fn track_path_in(target: &str, token: &str) -> Option<String> {
    let hex = target
        .strip_prefix('/')?
        .strip_prefix(token)?
        .strip_prefix('/')?;
    String::from_utf8(decode_hex(hex)?).ok()
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) {
        return None;
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let [high, low] = pair else { return None };
            // Digit by digit: `u8::from_str_radix` would also accept a leading `+`.
            let digit = |byte: &u8| char::from(*byte).to_digit(16);
            u8::try_from(digit(high)? << 4 | digit(low)?).ok()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        net::TcpStream,
    };

    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";
    const SONG_SIZE: u64 = 10;
    const SONG_BYTES: &[u8] = b"ID3 and the frames of a song";

    /// What the server answered to one request.
    struct Answer {
        status: String,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    impl Answer {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(header, _)| header.eq_ignore_ascii_case(name))
                .map(|(_, value)| value.as_str())
        }
    }

    /// Sends one request to `url`, the way the webview's HTTP client does, and reads the answer.
    fn send(method: &str, url: &str, headers: &[&str]) -> Answer {
        let (address, path) = url
            .strip_prefix("http://")
            .unwrap()
            .split_once('/')
            .unwrap();
        let mut stream = TcpStream::connect(address).unwrap();
        let mut request = format!("{method} /{path} HTTP/1.1\r\nHost: {address}\r\n");
        for header in headers {
            request.push_str(&format!("{header}\r\n"));
        }
        request.push_str("\r\n");
        stream.write_all(request.as_bytes()).unwrap();

        let mut response = Vec::new();
        stream.read_to_end(&mut response).unwrap();
        let head_end = response
            .windows(4)
            .position(|bytes| bytes == b"\r\n\r\n")
            .unwrap();
        let head = String::from_utf8(response[..head_end].to_vec()).unwrap();
        let mut lines = head.split("\r\n");
        Answer {
            status: lines.next().unwrap().to_owned(),
            headers: lines
                .map(|line| {
                    let (name, value) = line.split_once(": ").unwrap();
                    (name.to_owned(), value.to_owned())
                })
                .collect(),
            body: response[head_end + 4..].to_vec(),
        }
    }

    fn get(url: &str, headers: &[&str]) -> Answer {
        send("GET", url, headers)
    }

    /// A server for a new root folder whose Songs folder holds `song_file_name`.
    fn server_with_song(song_file_name: &str) -> (tempfile::TempDir, SongServer) {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("Songs")).unwrap();
        fs::write(root.path().join("Songs").join(song_file_name), SONG_BYTES).unwrap();
        let server = SongServer::start(root.path().to_path_buf()).unwrap();
        (root, server)
    }

    #[test]
    fn serves_a_whole_song_at_the_url_it_gives() {
        let (_root, server) = server_with_song("Heroes of Sand.mp3");

        let answer = get(&server.url_of("Songs/Heroes of Sand.mp3"), &[]);

        assert_eq!(answer.status, "HTTP/1.1 200 OK");
        assert_eq!(answer.header("Content-Type"), Some("audio/mpeg"));
        assert_eq!(
            answer.header("Content-Length"),
            Some(SONG_BYTES.len().to_string().as_str())
        );
        assert_eq!(answer.header("Accept-Ranges"), Some("bytes"));
        assert_eq!(answer.header("Cache-Control"), Some("no-store"));
        assert_eq!(answer.body, SONG_BYTES);
    }

    #[test]
    fn serves_the_part_of_a_song_asked_for() {
        let (_root, server) = server_with_song("Spirit of the Air.mp3");

        let answer = get(
            &server.url_of("Songs/Spirit of the Air.mp3"),
            &["Range: bytes=4-9"],
        );

        assert_eq!(answer.status, "HTTP/1.1 206 Partial Content");
        assert_eq!(
            answer.header("Content-Range"),
            Some(format!("bytes 4-9/{}", SONG_BYTES.len()).as_str())
        );
        assert_eq!(answer.header("Content-Length"), Some("6"));
        assert_eq!(answer.body, &SONG_BYTES[4..=9]);
    }

    #[test]
    fn answers_a_range_past_the_end_with_the_size_of_the_song() {
        let (_root, server) = server_with_song("Make Believe.mp3");

        let answer = get(
            &server.url_of("Songs/Make Believe.mp3"),
            &["Range: bytes=100-"],
        );

        assert_eq!(answer.status, "HTTP/1.1 416 Range Not Satisfiable");
        assert_eq!(
            answer.header("Content-Range"),
            Some(format!("bytes */{}", SONG_BYTES.len()).as_str())
        );
        assert!(answer.body.is_empty());
    }

    #[test]
    fn serves_nothing_without_the_token() {
        let (_root, server) = server_with_song("Running Alone.mp3");
        let url = server.url_of("Songs/Running Alone.mp3");
        let (base_url, song) = url.rsplit_once('/').unwrap();
        let (origin, token) = base_url.rsplit_once('/').unwrap();
        let wrong_token = "0".repeat(token.len());

        let answer = get(&format!("{origin}/{wrong_token}/{song}"), &[]);

        assert_eq!(answer.status, "HTTP/1.1 404 Not Found");
        assert!(answer.body.is_empty());
    }

    #[test]
    fn serves_only_the_songs_of_the_songs_folder() {
        let (root, server) = server_with_song("No Pain for the Dead.mp3");
        fs::write(root.path().join("The Shadow Hunter.mp3"), SONG_BYTES).unwrap();
        fs::write(
            root.path().join("Songs").join("Heroes of Sand.txt"),
            SONG_BYTES,
        )
        .unwrap();

        for track_path in [
            "The Shadow Hunter.mp3",
            "Songs/../The Shadow Hunter.mp3",
            "Songs/Heroes of Sand.txt",
            "Songs/Spirit of the Air.mp3",
        ] {
            let answer = get(&server.url_of(track_path), &[]);

            assert_eq!(
                answer.status, "HTTP/1.1 404 Not Found",
                "{track_path} should not be served"
            );
        }
    }

    #[test]
    fn accepts_only_get() {
        let (_root, server) = server_with_song("Make Believe.mp3");

        let answer = send("POST", &server.url_of("Songs/Make Believe.mp3"), &[]);

        assert_eq!(answer.status, "HTTP/1.1 405 Method Not Allowed");
        assert_eq!(answer.header("Allow"), Some("GET"));
    }

    #[test]
    fn starts_the_server_once() {
        let root = tempfile::tempdir().unwrap();
        let song_server = LazySongServer::default();

        let first = song_server.get_or_start(root.path()).unwrap();
        let second = song_server.get_or_start(root.path()).unwrap();

        assert_eq!(
            first.url_of("Songs/Running Alone.mp3"),
            second.url_of("Songs/Running Alone.mp3")
        );
    }

    #[test]
    fn writes_bytes_as_lowercase_hex() {
        assert_eq!(encode_hex(&[0x00, 0x0f, 0xab, 0xff]), "000fabff");
    }

    #[test]
    fn reads_back_the_hex_it_writes() {
        for track_path in [
            "Songs/Silence and Distance.mp3",
            "Songs/01 - Fíreworks (100% #2?).mp3",
        ] {
            let hex = encode_hex(track_path.as_bytes());

            assert_eq!(decode_hex(&hex).unwrap(), track_path.as_bytes());
        }
    }

    #[test]
    fn refuses_hex_of_odd_length_or_with_other_characters() {
        for text in ["abc", "zz", "0g", "+f", "é1"] {
            assert_eq!(decode_hex(text), None, "{text} should be refused");
        }
    }

    #[test]
    fn finds_the_track_path_in_a_target_with_the_token() {
        let track_path = "Songs/Lease of Life.mp3";
        let target = format!("/{TOKEN}/{}", encode_hex(track_path.as_bytes()));

        assert_eq!(track_path_in(&target, TOKEN).unwrap(), track_path);
    }

    #[test]
    fn refuses_targets_without_the_token_or_with_other_segments() {
        let hex = encode_hex(b"Songs/Running Alone.mp3");
        let wrong_token = "f".repeat(TOKEN.len());

        for target in [
            format!("/{wrong_token}/{hex}"),
            format!("/{TOKEN}x/{hex}"),
            format!("{TOKEN}/{hex}"),
            format!("/{TOKEN}"),
            format!("/{TOKEN}/{hex}/{hex}"),
            format!("/{TOKEN}/{hex}?download"),
            format!("/{TOKEN}/zz"),
        ] {
            assert_eq!(
                track_path_in(&target, TOKEN),
                None,
                "{target} should be refused"
            );
        }
    }

    #[test]
    fn sends_the_whole_song_without_a_range() {
        assert_eq!(byte_range(None, SONG_SIZE), ByteRange::Whole);
    }

    #[test]
    fn sends_the_whole_song_for_ranges_it_does_not_handle() {
        // A server may ignore a Range header it doesn't understand, and answer with everything.
        for header in [
            "items=0-5",
            "bytes=0-1,4-5",
            "bytes=5-2",
            "bytes=x-",
            "bytes=-",
            "nonsense",
        ] {
            assert_eq!(
                byte_range(Some(header), SONG_SIZE),
                ByteRange::Whole,
                "{header} should get the whole song"
            );
        }
    }

    #[test]
    fn sends_the_bytes_between_two_positions_cut_at_the_end_of_the_song() {
        assert_eq!(
            byte_range(Some("bytes=2-5"), SONG_SIZE),
            ByteRange::Part { first: 2, last: 5 }
        );
        assert_eq!(
            byte_range(Some("bytes=2-50"), SONG_SIZE),
            ByteRange::Part { first: 2, last: 9 }
        );
    }

    #[test]
    fn sends_the_rest_of_the_song_from_a_position() {
        assert_eq!(
            byte_range(Some("bytes=4-"), SONG_SIZE),
            ByteRange::Part { first: 4, last: 9 }
        );
    }

    #[test]
    fn sends_the_last_bytes_of_the_song() {
        assert_eq!(
            byte_range(Some("bytes=-3"), SONG_SIZE),
            ByteRange::Part { first: 7, last: 9 }
        );
        assert_eq!(
            byte_range(Some("bytes=-30"), SONG_SIZE),
            ByteRange::Part { first: 0, last: 9 }
        );
    }

    #[test]
    fn refuses_ranges_that_start_past_the_end_of_the_song() {
        for header in ["bytes=10-", "bytes=10-12", "bytes=-0"] {
            assert_eq!(
                byte_range(Some(header), SONG_SIZE),
                ByteRange::Unsatisfiable,
                "{header} should be refused"
            );
        }
        assert_eq!(byte_range(Some("bytes=0-"), 0), ByteRange::Unsatisfiable);
    }
}
