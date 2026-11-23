import { PencilIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { IconButton } from '../../../components/IconButton/IconButton'
import { StatusLine } from '../../../components/StatusLine/StatusLine'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { MISSING_SONGS_LABEL, PLAYLISTS_ICON } from '../constants'
import { PlaylistDialog } from '../PlaylistDialog/PlaylistDialog'
import { PlaylistPlayButton } from '../PlaylistPlayButton/PlaylistPlayButton'
import { PlaylistSongList } from '../PlaylistSongList/PlaylistSongList'
import { describePlaylist } from '../playlistStatus'
import { usePlaylistsStore } from '../playlistsStore'
import { RecheckButton } from '../RecheckButton/RecheckButton'
import type { SavedPlaylist } from '../types'

type PlaylistPageProps = {
  /** The playlist on screen. */
  playlist: SavedPlaylist
}

/**
 * One playlist, opened from its row in the Playlists view. Its header has a back button to the
 * list of playlists, the playlist's title, a red alert after it while the playlist's file says
 * songs are missing, then a Recheck button meanwhile, an Edit button, which opens the playlist's
 * dialog filled with its values (`PlaylistDialog`), and a large play button, which always starts
 * from the first song. Below the rule, the status line counts the songs and gives the description, and
 * the songs follow, to play, reorder and remove (`PlaylistSongList`). While songs are missing,
 * every play button of the playlist is disabled.
 *
 * @summary Page of one playlist and its songs
 */
export const PlaylistPage = ({ playlist }: PlaylistPageProps) => {
  const showList = usePlaylistsStore(state => state.showList)
  const [isEditing, setIsEditing] = useState(false)

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
              <IconButton
                icon={PencilIcon}
                label={`Edit ${playlist.title}`}
                onClick={() => setIsEditing(true)}
              />
              <PlaylistPlayButton playlist={playlist} isLarge />
            </>
          }
        />
      }
    >
      {/* At least as tall as the view, so the message without songs can sit in its middle. */}
      <div className="flex min-h-full flex-col">
        <StatusLine>{describePlaylist(playlist)}</StatusLine>
        <PlaylistSongList playlist={playlist} />
      </div>
      <PlaylistDialog isOpen={isEditing} onClose={() => setIsEditing(false)} playlist={playlist} />
    </ViewLayout>
  )
}
