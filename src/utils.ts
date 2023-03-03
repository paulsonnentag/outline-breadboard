import { Prop } from "@automerge/automerge"

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
