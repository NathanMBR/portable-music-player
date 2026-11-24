import { DataInteractive } from '@headlessui/react'
import type { MouseEvent, ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { FOCUS_CLASSES } from '../../../components/buttonStyles'
import { log } from '../../logging/log'
import { notifyError } from '../../notifications/notify'
import { openLink } from '../updatesApi'

type PatchNotesProps = {
  /** The release's notes, in Markdown, from its `latest.json`: empty when it has none. */
  notes: string
}

// The images the app would load from the web, which it never does.
const LEFT_OUT_ELEMENTS = ['img']

const SECTION_HEADING_CLASSES = 'mt-3 mb-1 font-semibold text-ink first:mt-0'

const openPatchNotesLink = async (url: string) => {
  try {
    await openLink(url)
    log(`Opened link "${url}"`)
  } catch (error) {
    notifyError("Couldn't open the link", error)
  }
}

const PatchNotesLink = ({ href, children }: { href?: string; children: ReactNode }) => {
  const openInBrowser = (event: MouseEvent) => {
    event.preventDefault()
    if (href) {
      void openPatchNotesLink(href)
    }
  }

  return (
    <DataInteractive
      as="a"
      href={href}
      onClick={openInBrowser}
      className={`rounded-sm text-pen underline underline-offset-2 ${FOCUS_CLASSES}`}
    >
      {children}
    </DataInteractive>
  )
}

// The dialog's title is the h2, so the notes' headings sit under it.
const SectionHeading = ({ children }: { children?: ReactNode }) => (
  <h3 className={SECTION_HEADING_CLASSES}>{children}</h3>
)

const SubsectionHeading = ({ children }: { children?: ReactNode }) => (
  <h4 className={SECTION_HEADING_CLASSES}>{children}</h4>
)

const NOTES_COMPONENTS: Components = {
  h1: SectionHeading,
  h2: SectionHeading,
  h3: SubsectionHeading,
  h4: SubsectionHeading,
  h5: SubsectionHeading,
  h6: SubsectionHeading,
  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="py-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-rule pl-3 text-ink-faded">{children}</blockquote>
  ),
  code: ({ children }) => <code className="rounded-sm bg-rule/60 px-1">{children}</code>,
  pre: ({ children }) => <pre className="my-1 overflow-x-auto">{children}</pre>,
  hr: () => <hr className="my-2 border-rule" />,
  a: ({ href, children }) => <PatchNotesLink href={href}>{children}</PatchNotesLink>
}

/**
 * The patch notes of the release an update brings, from Markdown: headings, lists, emphasis,
 * code and links, styled like the rest of the app. A link opens in the default browser, so the
 * window never leaves the player. Images and HTML are left out, since the app loads nothing from
 * the web. Notes left empty say no changes were listed.
 *
 * @summary Patch notes of an update, from Markdown
 */
export const PatchNotes = ({ notes }: PatchNotesProps) => {
  if (!notes.trim()) {
    return <p className="text-ink-faded">No changes were listed for this version.</p>
  }
  return (
    <Markdown components={NOTES_COMPONENTS} disallowedElements={LEFT_OUT_ELEMENTS} skipHtml>
      {notes}
    </Markdown>
  )
}
