import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import type { ComponentProps, ReactNode } from 'react'
import {
  DISABLED_CLASSES,
  FOCUS_CLASSES,
  STEP_INDICATOR_CLASSES,
  STEP_TAB_CLASSES
} from '../buttonStyles'

type StepTab = {
  /** The step's name, on its tab and for screen readers. */
  label: string
  /** What the step's panel shows while it's the current step. */
  content: ReactNode
  /** Disables the step's tab while the form can't go to it, when the tabs can be clicked. */
  isDisabled?: boolean
}

type StepTabsProps = {
  /** What the steps are about, for screen readers, like "Playlist". */
  label: string
  /** The steps, in their order. */
  tabs: readonly StepTab[]
  /** The current step's index in `tabs`, which the form's own buttons change. */
  stepIndex: number
  /**
   * Lets the tabs be clicked, running with the index of the step chosen. Leave it out to keep the
   * steps to the form's own buttons.
   */
  onStepChange?: (index: number) => void
}

// Headless UI makes the current tab and its panel focusable. When the form's buttons alone move
// between the steps, the keyboard has nothing to do on a tab, and a step's panel always holds the
// form's own fields.
const UnfocusableTab = (props: ComponentProps<'button'>) => <button {...props} tabIndex={-1} />
const UnfocusablePanel = (props: ComponentProps<'div'>) => <div {...props} tabIndex={-1} />

const TAB_GEOMETRY_CLASSES =
  'px-3 pb-2 text-sm font-semibold transition-colors duration-300 ease-out motion-reduce:transition-none'

/**
 * The steps of a form, as tabs above the current step's panel, like the playlist dialog's Details
 * and Songs. The current step's tab is in pen, with a pen bar under it that slides to the next
 * current tab. The tabs share their width, so the bar keeps one size. Only the current step's
 * panel is on the page.
 *
 * Without `onStepChange`, the tabs only show where the form is, as when creating a playlist: they
 * can't be clicked and the keyboard never stops on them, since the form's own buttons, like Next
 * and Back, move between the steps. With it, as when editing a playlist, a click on a tab goes to
 * its step, unless the step is disabled; from the keyboard, Tab reaches the current tab, the arrows
 * move between the tabs, and Enter or Space goes to the focused one's step. The arrows alone never
 * change the step, since a step may focus its first field when it shows. A tab's click is logged
 * like any button's.
 *
 * @summary Tabs showing the current step of a form
 */
export const StepTabs = ({ label, tabs, stepIndex, onStepChange }: StepTabsProps) => {
  const isClickable = onStepChange !== undefined

  return (
    <TabGroup
      selectedIndex={stepIndex}
      onChange={onStepChange}
      manual
      className="flex min-h-0 flex-col"
    >
      <div className="border-b border-rule">
        <div className="relative w-fit">
          <TabList
            aria-label={label}
            className={`grid auto-cols-fr grid-flow-col ${isClickable ? '' : 'pointer-events-none'}`}
          >
            {tabs.map(tab =>
              isClickable ? (
                <Tab
                  key={tab.label}
                  disabled={tab.isDisabled}
                  className={`cursor-pointer ${TAB_GEOMETRY_CLASSES} ${STEP_TAB_CLASSES} ${FOCUS_CLASSES} ${DISABLED_CLASSES}`}
                >
                  {tab.label}
                </Tab>
              ) : (
                <Tab
                  key={tab.label}
                  as={UnfocusableTab}
                  className={`cursor-default ${TAB_GEOMETRY_CLASSES} ${STEP_TAB_CLASSES}`}
                >
                  {tab.label}
                </Tab>
              )
            )}
          </TabList>
          <span
            aria-hidden="true"
            data-step-indicator
            className={`absolute -bottom-px left-0 h-0.5 transition-transform duration-300 ease-out motion-reduce:transition-none ${STEP_INDICATOR_CLASSES}`}
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${stepIndex * 100}%)`
            }}
          />
        </div>
      </div>
      <TabPanels className="flex min-h-0 flex-col">
        {tabs.map(tab => (
          <TabPanel
            key={tab.label}
            as={UnfocusablePanel}
            className="flex min-h-0 flex-col outline-none"
          >
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  )
}
