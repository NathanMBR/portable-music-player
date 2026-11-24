/**
 * A small pen dot on the top-right corner of a control, saying something new waits behind it, like
 * an update found behind the menu button and on the menu's Update option. It sits on the nearest
 * `relative` ancestor's corner, ringed with the paper to stand clear of the control's border, and
 * lets clicks through. Screen readers skip it: what waits is said where it shows. It's pen, not
 * correction, since red means trouble in the app.
 *
 * @summary Dot on a control's corner, for something new behind it
 */
export const NotificationDot = () => (
  <span
    aria-hidden="true"
    data-notification-dot
    className="pointer-events-none absolute top-0 right-0 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-pen ring-2 ring-paper"
  />
)
