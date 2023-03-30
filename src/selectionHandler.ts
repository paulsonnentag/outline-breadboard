// I've implemented this in plain JavaScript instead of using React context to make it easy to register handlers from Codemirror widgets

export interface SelectionHandler {
  onSelect: (nodeId: string) => void // called when
  onUnregister?: () => void // called when selection handler is preceeded by new selection handler
}

let currentSelectionHandler: SelectionHandler | undefined = undefined

export function registerSelectionHandler(handler: SelectionHandler | ((nodeId: string) => void)) {
  if (currentSelectionHandler?.onUnregister) {
    currentSelectionHandler.onUnregister()
  }

  currentSelectionHandler = typeof handler === "function" ? { onSelect: handler } : handler
}

export function unregisterSelectionHandler(handler: SelectionHandler | ((nodeId: string) => void)) {
  if (
    (typeof handler === "function" && currentSelectionHandler?.onSelect === handler) ||
    handler === currentSelectionHandler
  ) {
    currentSelectionHandler = undefined
  }
}

export function isSelectionHandlerActive(): boolean {
  console.log(currentSelectionHandler)

  return currentSelectionHandler !== undefined
}

export function triggerSelect(nodeId: string) {
  if (currentSelectionHandler) {
    currentSelectionHandler.onSelect(nodeId)
  }
}
