import { KeyboardEvent as ReactKeyboardEvent } from "react"

export function isDown(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "ArrowDown" || (evt.key === "n" && evt.ctrlKey)
}

export function isUp(evt: KeyboardEvent | ReactKeyboardEvent) {
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

export function isSlash(evt: KeyboardEvent | ReactKeyboardEvent) {
  return evt.key === "/"
}
