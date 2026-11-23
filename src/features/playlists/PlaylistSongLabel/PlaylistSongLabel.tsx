import { PhotoIcon } from '@heroicons/react/20/solid'
import { CoverThumbnail } from '../../library/CoverThumbnail/CoverThumbnail'
import { TrackName } from '../../library/TrackName/TrackName'
import { type PlaylistSong, songNameOf } from '../playlistSongs'

type PlaylistSongLabelProps = {
  /** The song of the playlist, with its track when the last scan found it. */
  song: PlaylistSong
  /** Gives the artist the row's pen, on the pen tint of the song in the player. */
  isInPlayer?: boolean
}

/**
 * A song of a playlist as its rows show it: a found song's cover and name, like in the song list,
 * or, for a song the last scan of the Songs folder lacks, the placeholder in place of its cover and
 * its file name, without the extension, in a lighter ink. Either way the names of every row line
 * up, and a name too long for its row is cut, shown whole when hovered.
 *
 * @summary A playlist song's cover and name, found or missing
 */
export const PlaylistSongLabel = ({ song, isInPlayer = false }: PlaylistSongLabelProps) => {
  if (song.track) {
    return (
      <>
        <CoverThumbnail path={song.track.path} />
        <TrackName track={song.track} isInPlayer={isInPlayer} />
      </>
    )
  }

  const name = songNameOf(song)
  return (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center rounded bg-rule">
        <PhotoIcon aria-hidden="true" className="size-5 text-ink-faded" />
      </div>
      <span title={name} className="truncate text-ink-faded font-stretch-semi-condensed">
        {name}
      </span>
    </>
  )
}
