import { isString } from "./utils"
import { getNode, Graph, ValueNode } from "./graph"
import LatLngLiteral = google.maps.LatLngLiteral

const LAT_LONG_REGEX = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/

export function parseLatLng(value: any): google.maps.LatLngLiteral | undefined {
  if (typeof value != "string") {
    return undefined
  }

  const match = value.match(LAT_LONG_REGEX)

  if (!match) {
    return
  }

  const [, rawLat, rawLng] = match
  const lat = parseFloat(rawLat)
  const lng = parseFloat(rawLng)

  if (isNaN(lat) || isNaN(lng)) {
    return
  }

  return { lat, lng }
}

export function readParsedProperty<T>(
  graph: Graph,
  nodeId: string,
  key: string,
  parse: (value: any) => T | undefined
): T | undefined {
  const children: ValueNode[] = getNode(graph, nodeId).children.map((childId: string) =>
    getNode(graph, childId)
  )

  for (const childNode of children) {
    if (childNode.value.startsWith(`${key}:`)) {
      const value = parse(childNode.value.split(":")[1])

      if (value !== undefined) {
        return value
      }
    }
  }

  return undefined
}

const DATE_REF_REGEX = /([0-9]{2})\/([0-9]{2})\/([0-9]{4})/

export function parseDate(string: string | undefined): Date | undefined {
  if (string === undefined) {
    return undefined
  }

  const match = string.match(DATE_REF_REGEX)

  if (!match) {
    return undefined
  }

  const month = parseInt(match[1], 10)
  const day = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  return new Date(year, month - 1, day)
}

const TIME_REF_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseTime(string: string | undefined): Time | undefined {
  if (string === undefined) {
    return undefined
  }

  const match = string.match(TIME_REF_REGEX)

  if (!match) {
    return undefined
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  }
}

export interface Time {
  hour: number 
  minute: number
}

export function readLatLng(graph: Graph, nodeId: string): LatLngLiteral | undefined {
  return readParsedProperty<LatLngLiteral>(graph, nodeId, "position", (value) => {
    if (value.lat && value.lng) {
      return value as LatLngLiteral
    }

    if (isString(value)) {
      return parseLatLng(value)
    }

    return undefined
  })
}
