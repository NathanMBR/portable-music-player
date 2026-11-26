#!/usr/bin/env bash
# Makes the songs the Rust tests can't build themselves, since no Rust crate encodes their codec,
# into audio_fixtures/ next to this script. Each holds 1 s of a synthetic signal at 44.1 kHz, a
# quiet tone per channel, stereo unless its name says otherwise, without tags, in a few KB. The
# tests read the committed files: run this again only to change one. Needs FFmpeg with libvorbis.
# Usage: make_audio_fixtures.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly FIXTURES_DIR="${SCRIPT_DIR}/audio_fixtures"
readonly SIGNAL='aevalsrc=0.05*sin(2*PI*440*t)|0.04*sin(2*PI*660*t):s=44100:d=1'
readonly SURROUND_SIGNAL='aevalsrc=0.05*sin(2*PI*300*t)|0.05*sin(2*PI*500*t)|0.05*sin(2*PI*700*t)|0.05*sin(2*PI*60*t)|0.05*sin(2*PI*900*t)|0.05*sin(2*PI*1100*t):c=5.1:s=44100:d=1'
# One chapter, over the song's first quarter only: the chapter track has no sample after it.
readonly CHAPTERS=';FFMETADATA1
[CHAPTER]
TIMEBASE=1/1000
START=0
END=250
title=Intro'

# Runs FFmpeg on the inputs and output options given, then the output file. bitexact leaves out the
# encoder's version and random stream serials, so making a fixture again with the same FFmpeg gives
# the same bytes.
ff() {
  local output="${*: -1}"
  ffmpeg -hide_banner -loglevel error -y "${@:1:$#-1}" -fflags +bitexact -flags:a +bitexact \
    "${output}"
}

# Encodes the signal with the given output options, then the output file.
encode() {
  local output="${*: -1}"
  ff -f lavfi -i "${SIGNAL}" -map_metadata -1 "${@:1:$#-1}" "${output}"
}

mkdir -p "${FIXTURES_DIR}"
encode -c:a libvorbis -q:a 2 "${FIXTURES_DIR}/vorbis.ogg"
# AAC in MP4, its priming cut by the edit list FFmpeg writes.
encode -c:a aac -b:a 64k "${FIXTURES_DIR}/aac.m4a"
# 16-bit samples: FFmpeg would otherwise store the signal in 32.
encode -c:a alac -sample_fmt s16p "${FIXTURES_DIR}/alac.m4a"
# Raw AAC in ADTS frames: nothing in it says where its priming ends.
encode -c:a aac -b:a 64k -f adts "${FIXTURES_DIR}/adts.aac"
# A chapter track besides the audio, like a podcast's or an audiobook's. The global metadata comes
# from the chapters' file, which holds none: dropping it would drop the chapter track too.
ff -f lavfi -i "${SIGNAL}" -f ffmetadata -i <(printf '%s\n' "${CHAPTERS}") \
  -map 0:a -map_metadata 1 -map_chapters 1 -c:a aac -b:a 64k "${FIXTURES_DIR}/aac-chapters.m4a"
ff -f lavfi -i "${SURROUND_SIGNAL}" -map_metadata -1 -c:a aac -b:a 128k \
  "${FIXTURES_DIR}/aac-surround.m4a"
# An MP4 holding a picture track and no sound at all.
ff -f lavfi -i 'color=c=black:s=16x16:r=10:d=0.5' -map_metadata -1 -c:v mpeg4 \
  "${FIXTURES_DIR}/no-sound.m4a"
