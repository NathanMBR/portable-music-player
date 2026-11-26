#!/usr/bin/env bash
# Makes the songs the Rust tests can't build themselves, since no Rust crate encodes their codec,
# into audio_fixtures/ next to this script. Each holds 1 s of a synthetic stereo signal at 44.1 kHz,
# a tone per channel, without tags, in a few KB. The tests read the committed files: run this again
# only to change one. Needs FFmpeg with libvorbis.
# Usage: make_audio_fixtures.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly FIXTURES_DIR="${SCRIPT_DIR}/audio_fixtures"
readonly SIGNAL='aevalsrc=0.5*sin(2*PI*440*t)|0.4*sin(2*PI*660*t):s=44100:d=1'

# Encodes the signal with the given output options. bitexact leaves out the encoder's version, so
# making a fixture again with another FFmpeg changes only its audio.
encode() {
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "${SIGNAL}" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact "$@"
}

mkdir -p "${FIXTURES_DIR}"
encode -c:a libvorbis -q:a 2 "${FIXTURES_DIR}/vorbis.ogg"
