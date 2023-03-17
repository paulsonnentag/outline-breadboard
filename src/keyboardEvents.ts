import { KeyboardEvent as ReactKeyboardEvent } from "react"

export function isArrowDown(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "ArrowDown" || (evt.key === "n" && evt.ctrlKey)
}

export function isArrowUp(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "ArrowUp" || (evt.key === "p" && evt.ctrlKey)
}

export function isBackspace(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "Backspace"
}

export function isTab(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "Tab"
}

export function isEnter(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "Enter"
}

export function isEscape(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "Escape"
}
