/** A newer stable release than the one running (mirrors `FoundUpdate` in updates.rs). */
export type FoundUpdate = {
  version: string
  /** The release's patch notes, in Markdown: empty when it has none. */
  notes: string
}
