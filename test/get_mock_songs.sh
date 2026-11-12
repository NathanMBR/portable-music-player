#!/usr/bin/env bash
# Prints random songs from mock_songs.csv (next to this script) as CSV records, title,artist, one
# per line and without a header. A song repeats only when more are asked for than the file holds,
# and then every song is used before any repeats.
# mock_songs.csv follows RFC 4180 under a title,artist header, one song per line: a field holding a
# comma, a double quote, or leading or trailing spaces is enclosed in double quotes, with inner
# quotes doubled. The title is required and the artist may be empty. Fields can't hold line breaks.
# The printed records follow the same rules, quoting a field only when it needs it.
# Usage: get_mock_songs.sh [count]   count: a positive integer, 1 by default
set -euo pipefail

readonly SONGS_FILE_NAME='mock_songs.csv'
readonly SONGS_HEADER='title,artist'
readonly DEFAULT_COUNT=1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly SONGS_FILE="${SCRIPT_DIR}/${SONGS_FILE_NAME}"
readonly USAGE="Usage: ${0##*/} [count]   (count: a positive integer, default ${DEFAULT_COUNT})"
readonly OUTPUT_DESCRIPTION="Prints count random songs from ${SONGS_FILE_NAME} as CSV records \
(${SONGS_HEADER}), one per line, without a header."

# Validates the songs file and prints every song as a CSV record that quotes a field only when it
# needs it. On a malformed file, prints only what is wrong and exits with status 1.
readonly READ_SONGS_PROGRAM='
function reject(problem) {
  error = "line " NR ": " problem
  exit 1
}

# Reads the quoted field at position in record, leaving position just after its closing quote.
function read_quoted_field(record, field_number,    field, character) {
  field = ""
  position++
  while (1) {
    if (position > length(record)) {
      reject("field " field_number " has an unterminated double quote; " LINE_BREAK_RULE)
    }
    character = substr(record, position, 1)
    if (character == QUOTE) {
      if (substr(record, position + 1, 1) != QUOTE) break
      position++
    }
    field = field character
    position++
  }
  position++
  return field
}

# Reads the unquoted field at position in record, leaving position on the separator or the end.
function read_unquoted_field(record, field_number,    field, character) {
  field = ""
  while (position <= length(record)) {
    character = substr(record, position, 1)
    if (character == SEPARATOR) break
    if (character == QUOTE) {
      reject("field " field_number " holds a double quote, so it must be enclosed in double quotes")
    }
    field = field character
    position++
  }
  return field
}

# Splits the record into fields[1..n] and returns n.
function split_record(record, fields,    field_count) {
  field_count = 0
  position = 1
  while (1) {
    field_count++
    if (substr(record, position, 1) == QUOTE) {
      fields[field_count] = read_quoted_field(record, field_count)
    } else {
      fields[field_count] = read_unquoted_field(record, field_count)
    }
    if (position > length(record)) return field_count
    if (substr(record, position, 1) != SEPARATOR) {
      reject("field " field_count " has text after its closing double quote")
    }
    position++
  }
}

function encode_field(field) {
  if (index(field, QUOTE) || index(field, SEPARATOR) || field ~ /^ / || field ~ / $/) {
    gsub(QUOTE, QUOTE QUOTE, field)
    return QUOTE field QUOTE
  }
  return field
}

BEGIN {
  QUOTE = "\""
  SEPARATOR = ","
  LINE_BREAK_RULE = "fields cannot hold line breaks"
  TITLE_FIELD = 1
  ARTIST_FIELD = 2
  expected_field_count = split(header, header_fields, SEPARATOR)
}

# RFC 4180 ends lines with CRLF, so a file saved that way reads the same as one with LF.
{ sub(/\r$/, "") }

index($0, "\r") { reject("a field holds a carriage return; " LINE_BREAK_RULE) }

NR == 1 {
  if ($0 != header) reject("expected the header \"" header "\", found \"" $0 "\"")
  next
}

{
  field_count = split_record($0, fields)
  if (field_count != expected_field_count) {
    reject("expected " expected_field_count " fields (" header "), found " field_count)
  }
  if (fields[TITLE_FIELD] == "") reject("the title is empty")
  song_count++
  songs[song_count] = encode_field(fields[TITLE_FIELD]) SEPARATOR encode_field(fields[ARTIST_FIELD])
}

END {
  if (error != "") {
    print error
    exit 1
  }
  if (song_count == 0) {
    print "no songs below the header"
    exit 1
  }
  for (song_number = 1; song_number <= song_count; song_number++) print songs[song_number]
}
'

fail() {
  echo "Error: $1" >&2
  exit 1
}

if [[ "${1-}" == '-h' || "${1-}" == '--help' ]]; then
  echo "${USAGE}"
  echo "${OUTPUT_DESCRIPTION}"
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

if ! songs="$(awk -v header="${SONGS_HEADER}" "${READ_SONGS_PROGRAM}" "${SONGS_FILE}")"; then
  fail "${SONGS_FILE}: ${songs}"
fi

available_count="$(grep -c '' <<<"${songs}")"
remaining_count="${song_count}"
while ((remaining_count > 0)); do
  draw_count=$((remaining_count < available_count ? remaining_count : available_count))
  shuf -n "${draw_count}" <<<"${songs}"
  remaining_count=$((remaining_count - draw_count))
done
