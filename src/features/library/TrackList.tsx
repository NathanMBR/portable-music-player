import type { Track } from './types'

type TrackListProps = {
  tracks: Track[]
}

export const TrackList = ({ tracks }: TrackListProps) => (
  <ul aria-label="Songs" className="pb-8">
    {tracks.map(track => (
      <li
        key={track.path}
        title={track.title}
        className="truncate border-b border-rule py-3 font-stretch-semi-condensed"
      >
        {track.title}
      </li>
    ))}
  </ul>
)
