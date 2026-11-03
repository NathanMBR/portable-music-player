import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { Slider } from '../../../components/Slider/Slider'
import { usePlaybackStore } from '../playbackStore'

// The slider counts in percent, while the store keeps the volume from 0 to 1, like audio elements.
const SLIDER_MAX = 100

/**
 * The right end of the audio player: a slider for the volume, from silent to full, next to a
 * speaker button that is crossed out at zero. Clicking the speaker mutes, and clicking it again
 * brings back the volume from before, or full volume if the slider was moved down to zero. Screen
 * readers hear the volume as a percentage.
 *
 * @summary Volume slider of the audio player
 */
export const VolumeSlider = () => {
  const volume = usePlaybackStore(state => state.volume)
  const setVolume = usePlaybackStore(state => state.setVolume)
  const toggleMute = usePlaybackStore(state => state.toggleMute)
  const percent = Math.round(volume * SLIDER_MAX)
  const isMuted = volume === 0

  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={isMuted ? SpeakerXMarkIcon : SpeakerWaveIcon}
        label={isMuted ? 'Unmute' : 'Mute'}
        onClick={toggleMute}
      />
      <div className="w-28">
        <Slider
          label="Volume"
          value={percent}
          max={SLIDER_MAX}
          valueText={`${percent}%`}
          onChange={value => setVolume(value / SLIDER_MAX)}
        />
      </div>
    </div>
  )
}
