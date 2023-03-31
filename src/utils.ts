import { Prop } from "@automerge/automerge"
import { getNode, Graph } from "./graph"

export function last<T>(arr: T[]) {
  return arr[arr.length - 1]
}

export function lookupPath(object: any, path: Prop[]): any {
  let value = object

  for (const key of path) {
    if (value == undefined) {
      return undefined
    }

    value = value[key]
  }

  return value
}

export function isString(value: any): value is string {
  return typeof value === "string"
}

export function isArray(value: any): value is any[] {
  return value instanceof Array
}

// adapted from: https://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container/4812022#4812022
export function getCaretCharacterOffset(element: HTMLElement) {
  var caretOffset = 0
  var doc = element.ownerDocument || (element as any).document
  var win = doc.defaultView || (doc as any).parentWindow
  var sel
  if (typeof win.getSelection != "undefined") {
    sel = win.getSelection()
    if (sel.rangeCount > 0) {
      var range = win.getSelection().getRangeAt(0)
      var preCaretRange = range.cloneRange()
      preCaretRange.selectNodeContents(element)
      preCaretRange.setEnd(range.endContainer, range.endOffset)
      caretOffset = preCaretRange.toString().length
    }
  } else if ((sel = (doc as any).selection) && sel.type != "Control") {
    var textRange = sel.createRange()
    var preCaretTextRange = (doc.body as any).createTextRange()
    preCaretTextRange.moveToElementText(element)
    preCaretTextRange.setEndPoint("EndToEnd", textRange)
    caretOffset = preCaretTextRange.text.length
  }
  return caretOffset
}

// adapted from https://stackoverflow.com/questions/6249095/how-to-set-the-caret-cursor-position-in-a-contenteditable-element-div#answer-6249440
export function setCaretCharacterOffset(element: HTMLElement, offset: number) {
  var range = document.createRange()
  var selection = window.getSelection()

  try {
    range.setStart(element.childNodes[0], offset) // todo: this throws sometimes
    range.collapse(true)

    selection!.removeAllRanges()
    selection!.addRange(range)
  } catch (err) {}
}

// adapted from: https://stackoverflow.com/questions/4467539/javascript-modulo-gives-a-negative-result-for-negative-numbers#answer-4467559
export function mod(value: number, n: number) {
  return ((value % n) + n) % n
}

export function getIsHovering(
  graph: Graph,
  nodeId: string,
  parentIds: string[],
  isHoveringOverId: string | undefined
): boolean {
  if (isHoveringOverId === undefined) {
    return false
  }

  return [nodeId]
    .concat(parentIds)
    .some((id) => id == isHoveringOverId || getNode(graph, isHoveringOverId).value.includes(id))
}
