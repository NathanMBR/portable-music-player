/**
 * Docs pages render all of a component's stories at once. Stories that set store state would
 * overwrite each other there, because the stores are singletons, so each one renders in its own
 * iframe instead.
 */
export const renderInOwnFrame = (heightInPixels: number) => ({
  docs: { story: { inline: false, iframeHeight: heightInPixels } }
})
