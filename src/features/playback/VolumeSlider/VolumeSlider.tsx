import { Input } from '@headlessui/react'
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaybackStore } from '../playbackStore'

// The slider counts in percent, while the store keeps the volume from 0 to 1, like audio elements.
const SLIDER_MAX = 100

// The browser's own slider leaves the end of its track uncovered at full volume, so the track and
// the thumb are drawn here, like the progress bar. The thumb stays inside the track, so at full
// volume it covers its end. WebKitGTK and WebView2 both style the thumb through -webkit-.
const SLIDER_CLASSES =
  'h-1.5 w-28 appearance-none rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pen'

// A wider ring than the shared one, so it clears the thumb, which is taller than the track.
const KEYBOARD_FOCUS_CLASSES =
  'data-focus:outline-2 data-focus:outline-offset-4 data-focus:outline-pen'

// Headless UI rings inputs however they get focus, like text fields, but a slider clicked with the
// mouse doesn't need a ring. outline-none also hides the browser's own ring in that case.
const POINTER_FOCUS_CLASSES = 'outline-none'

// The track is pen up to the volume and rule after it.
const trackFill = (percent: number) =>
  `linear-gradient(to right, var(--color-pen) ${percent}%, var(--color-rule) ${percent}%)`

/**
 * The right end of the audio player: a slider for the volume, from silent to full, next to a
 * speaker button that is crossed out at zero. Clicking the speaker mutes, and clicking it again
 * brings back the volume from before, or full volume if the slider was moved down to zero. Screen
 * readers hear the volume as a percentage. Reached from the keyboard the slider shows the focus
 * ring; clicked with the mouse it doesn't.
 *
 * @summary Volume slider of the audio player
 */
export const VolumeSlider = () => {
  const volume = usePlaybackStore(state => state.volume)
  const setVolume = usePlaybackStore(state => state.setVolume)
  const toggleMute = usePlaybackStore(state => state.toggleMute)
  const percent = Math.round(volume * SLIDER_MAX)
  const isMuted = volume === 0
  const [isFocusedByPointer, setIsFocusedByPointer] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={isMuted ? SpeakerXMarkIcon : SpeakerWaveIcon}
        label={isMuted ? 'Unmute' : 'Mute'}
        onClick={toggleMute}
      />
      <Input
        type="range"
        min={0}
        max={SLIDER_MAX}
        value={percent}
        aria-label="Volume"
        aria-valuetext={`${percent}%`}
        onChange={event => setVolume(Number(event.target.value) / SLIDER_MAX)}
        onPointerDown={() => setIsFocusedByPointer(true)}
        onBlur={() => setIsFocusedByPointer(false)}
        style={{ background: trackFill(percent) }}
        className={`${SLIDER_CLASSES} ${isFocusedByPointer ? POINTER_FOCUS_CLASSES : KEYBOARD_FOCUS_CLASSES}`}
      />
    </div>
  )
}
