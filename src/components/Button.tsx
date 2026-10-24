import { Button as HeadlessButton } from '@headlessui/react'
import type { ReactNode } from 'react'

type ButtonProps = {
  children: ReactNode
  onClick: () => void
}

export const Button = ({ children, onClick }: ButtonProps) => (
  <HeadlessButton
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-md bg-pen px-3.5 py-2 text-sm font-semibold text-paper data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen data-hover:bg-pen/90"
  >
    {children}
  </HeadlessButton>
)
