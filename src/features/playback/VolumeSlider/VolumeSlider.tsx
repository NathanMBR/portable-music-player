import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { Slider } from '../../../components/Slider/Slider'
import { log } from '../../logging/log'
import { audibleVolume, usePlaybackStore } from '../playbackStore'

// The slider counts in percent, while the store keeps the volume from 0 to 1, like audio elements.
const SLIDER_MAX = 100

// In percent: twenty turns of the mouse wheel go from silent to full.
const WHEEL_STEP = 5

const formatPercent = (percent: number) => `${percent}%`

const logVolume = (percent: number) => log(`Set volume to ${formatPercent(percent)}`)

/**
 * The right end of the audio player: a slider for the volume, from silent to full, next to a
 * speaker button that is crossed out while muted. Clicking the speaker mutes, and clicking it
 * again brings the volume back. The song plays at the slider's volume as it moves, but the volume
 * is chosen only once the slider is released: released at zero, it mutes instead, keeping the
 * volume from before for unmuting. The mouse wheel over the slider turns the volume up or down by
 * 5%. The mouse over the slider shows, in a tooltip above it, the volume a click there would set.
 * Screen readers hear the volume as a percentage. The volume a move on the slider ends on is
 * logged, once a drag is released and at each turn of the wheel or press of a key.
 *
 * @summary Volume slider of the audio player
 */
export const VolumeSlider = () => {
  const heardVolume = usePlaybackStore(audibleVolume)
  const isMuted = usePlaybackStore(state => state.isMuted)
  const moveVolume = usePlaybackStore(state => state.moveVolume)
  const setVolume = usePlaybackStore(state => state.setVolume)
  const toggleMute = usePlaybackStore(state => state.toggleMute)
  const percent = Math.round(heardVolume * SLIDER_MAX)

  const chooseVolume = (chosenPercent: number) => {
    setVolume(chosenPercent / SLIDER_MAX)
    logVolume(chosenPercent)
  }

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
          valueText={formatPercent(percent)}
          onChange={value => moveVolume(value / SLIDER_MAX)}
          wheelStep={WHEEL_STEP}
          onCommit={chooseVolume}
          formatPointerValue={formatPercent}
        />
      </div>
    </div>
  )
}
