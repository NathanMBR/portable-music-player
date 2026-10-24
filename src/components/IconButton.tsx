import { Button } from '@headlessui/react'
import type { ComponentType } from 'react'

type IconButtonProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  isBusy?: boolean
}

export const IconButton = ({ icon: Icon, label, onClick, isBusy = false }: IconButtonProps) => (
  <Button
    aria-label={label}
    title={label}
    onClick={onClick}
    className="rounded-full p-2 text-ink-faded data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen data-hover:bg-rule/60 data-hover:text-ink"
  >
    <Icon className={isBusy ? 'size-5 motion-safe:animate-spin' : 'size-5'} />
  </Button>
)
