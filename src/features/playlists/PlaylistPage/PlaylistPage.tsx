import { MusicalNoteIcon, PhotoIcon } from '@heroicons/react/20/solid'
import { useMemo } from 'react'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { EmptyState } from '../../../components/EmptyState/EmptyState'
import { ListRow } from '../../../components/ListRow/ListRow'
import { StatusLine } from '../../../components/StatusLine/StatusLine'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { useScannedTracks } from '../../library/scannedTracks'
import { TrackRow } from '../../library/TrackRow/TrackRow'
import { MISSING_SONGS_LABEL, PLAYLISTS_ICON } from '../constants'
import { PlaylistPlayButton } from '../PlaylistPlayButton/PlaylistPlayButton'
import { findPlaylistSongs, type PlaylistSong, songNameOf } from '../playlistSongs'
import { describePlaylist } from '../playlistStatus'
import { usePlaylistsStore } from '../playlistsStore'
import { RecheckButton } from '../RecheckButton/RecheckButton'
import type { SavedPlaylist } from '../types'

type PlaylistPageProps = {
  /** The playlist on screen. */
  playlist: SavedPlaylist
}

// The alert and the square sit where a found song's play button and cover go, so the names of
// every row line up.
const MissingSongRow = ({ song }: { song: PlaylistSong }) => (
  <ListRow>
    <span className="flex size-9 shrink-0 items-center justify-center">
      <AlertMark label="Not in the Songs folder" />
    </span>
    <div className="flex size-9 shrink-0 items-center justify-center rounded bg-rule">
      <PhotoIcon aria-hidden="true" className="size-5 text-ink-faded" />
    </div>
    <span title={songNameOf(song)} className="truncate text-ink-faded font-stretch-semi-condensed">
      {songNameOf(song)}
    </span>
  </ListRow>
)

const PlaylistSongList = ({ playlist }: PlaylistPageProps) => {
  const tracks = useScannedTracks()
  const playPlaylist = usePlaylistsStore(state => state.playPlaylist)
  const songs = useMemo(() => findPlaylistSongs(playlist.songs, tracks), [playlist.songs, tracks])

  return (
    <ul aria-label={`Songs of ${playlist.title}`} className="pb-8">
      {songs.map(song =>
        song.track ? (
          <TrackRow
            key={song.fileName}
            track={song.track}
            onPlay={() => void playPlaylist(playlist.fileName, song.fileName)}
            isPlayDisabled={!playlist.allSongsFound}
          />
        ) : (
          <MissingSongRow key={song.fileName} song={song} />
        )
      )}
    </ul>
  )
}

/**
 * One playlist, opened from the Playlists view with See. Its header has a back button to the list
 * of playlists, the playlist's title, a red alert after it while the playlist's file says songs
 * are missing, then a Recheck button meanwhile, and a large play button, which always starts from
 * the first song. Below the rule, the status line counts the songs and gives the description. Each
 * song has a row like in the song list, and its play button plays the playlist from it. A song the
 * last scan of the Songs folder lacks is still listed, under its file name in a lighter ink, with
 * an alert where its play button would be. While songs are missing, every play button of the
 * playlist is disabled. A playlist without songs says so in the middle of the view.
 *
 * @summary Page of one playlist and its songs
 */
export const PlaylistPage = ({ playlist }: PlaylistPageProps) => {
  const showList = usePlaylistsStore(state => state.showList)

  return (
    <ViewLayout
      header={
        <ViewHeader
          icon={PLAYLISTS_ICON}
          back={{ label: 'Back to playlists', onClick: showList }}
          title={playlist.title}
          titleMark={!playlist.allSongsFound && <AlertMark label={MISSING_SONGS_LABEL} isLarge />}
          actions={
            <>
              <RecheckButton playlist={playlist} />
              <PlaylistPlayButton playlist={playlist} isLarge />
            </>
          }
        />
      }
    >
      {/* At least as tall as the view, so the message without songs can sit in its middle. */}
      <div className="flex min-h-full flex-col">
        <StatusLine>{describePlaylist(playlist)}</StatusLine>
        {playlist.songs.length === 0 ? (
          <EmptyState icon={MusicalNoteIcon} title="No songs in this playlist" />
        ) : (
          <PlaylistSongList playlist={playlist} />
        )}
      </div>
    </ViewLayout>
  )
}
