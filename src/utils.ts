import { Prop } from "@automerge/automerge"
import { getNode, Graph } from "./graph"
import { format, subYears } from "date-fns"

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

export function round(value: number, precision = 1) {
  return Math.round(value * Math.pow(2, precision)) / Math.pow(2, precision)
}

export function promisify<T>(value: T): Promise<T> {
  return new Promise((resolve, _) => {
    resolve(value)
  })
}

export function formatDate(date: Date): string {
  return format(date, "MM/dd/yyyy")
}

export function safeJsonStringify(obj: any): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch (err) {
    return `[circular object]`
  }
}

export function formatDuration(durationInMs: number) {
  const hours = Math.floor(durationInMs / (60 * 60 * 1000))
  const minutes = Math.max(Math.round((durationInMs - hours * 60 * 60 * 1000) / (60 * 1000)), 1)

  if (hours > 24) {
    return `${Math.round(hours / 24)} d`
  }

  if (hours !== 0) {
    return `${hours} h${minutes !== 0 ? ` ${minutes}` : ""}`
  }

  return `${minutes} m`
}

export function formatDistance(distanceInKm: number, distanceUnit: string) {
  if (distanceUnit.toLowerCase() === "miles") {
    const distanceInMiles = round(distanceInKm * 0.621371)
    return `${distanceInMiles >= 10 ? Math.round(distanceInMiles) : distanceInMiles} mi`
  }

  if (Math.round(distanceInKm) >= 10) {
    return `${Math.round(distanceInKm)} km`
  }

  if (distanceInKm < 1) {
    return `${Math.round(distanceInKm / 10) * 10}m`
  }

  return `${round(distanceInKm)} km`
}

// adapted from: https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server#18197341
export function download(filename: string, text: string) {
  var element = document.createElement("a")
  element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text))
  element.setAttribute("download", filename)

  element.style.display = "none"
  document.body.appendChild(element)

  element.click()

  document.body.removeChild(element)
}
