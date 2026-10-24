import { Button } from '@headlessui/react'
import type { ComponentType } from 'react'

type IconButtonShape = 'circle' | 'square'

type IconButtonProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  shape?: IconButtonShape
  isBusy?: boolean
}

const classesByShape: Record<IconButtonShape, string> = {
  circle: 'rounded-full p-2 text-ink-faded data-hover:text-ink',
  square: 'inline-flex size-10 items-center justify-center rounded-lg border border-rule text-ink'
}

export const IconButton = ({
  icon: Icon,
  label,
  onClick,
  shape = 'circle',
  isBusy = false
}: IconButtonProps) => (
  <Button
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`${classesByShape[shape]} data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen data-hover:bg-rule/60`}
  >
    <Icon className={isBusy ? 'size-5 motion-safe:animate-spin' : 'size-5'} />
  </Button>
)
