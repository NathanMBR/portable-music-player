export type Theme = 'light' | 'dark'

export type Settings = {
  /** `null` until the user picks one, which means following the OS. */
  theme: Theme | null
}
