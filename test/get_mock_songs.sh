#!/usr/bin/env bash
# Prints random song titles from mock_songs.txt (next to this script), one per line. A song repeats
# only when more are asked for than the file holds, and then every song is used before any repeats.
# Usage: get_mock_songs.sh [count]   count: a positive integer, 1 by default
set -euo pipefail

readonly SONGS_FILE_NAME='mock_songs.txt'
readonly DEFAULT_COUNT=1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly SONGS_FILE="${SCRIPT_DIR}/${SONGS_FILE_NAME}"
readonly USAGE="Usage: ${0##*/} [count]   (count: a positive integer, default ${DEFAULT_COUNT})"

fail() {
  echo "Error: $1" >&2
  exit 1
}

if [[ "${1-}" == '-h' || "${1-}" == '--help' ]]; then
  echo "${USAGE}"
  exit 0
fi

if (($# > 1)); then
  fail "expected at most one argument, got $#. ${USAGE}"
fi

song_count="${1-${DEFAULT_COUNT}}"
if [[ ! "${song_count}" =~ ^[1-9][0-9]*$ ]]; then
  fail "'${song_count}' is not a positive integer. ${USAGE}"
fi

if [[ ! -s "${SONGS_FILE}" ]]; then
  fail "${SONGS_FILE} is missing or empty."
fi

available_count="$(grep -c '' "${SONGS_FILE}")"
remaining_count="${song_count}"
while ((remaining_count > 0)); do
  draw_count=$((remaining_count < available_count ? remaining_count : available_count))
  shuf -n "${draw_count}" "${SONGS_FILE}"
  remaining_count=$((remaining_count - draw_count))
done
