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
