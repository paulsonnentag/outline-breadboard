import { isString } from "./utils"
import { parseFormula } from "./formulas"
import { getNode, Graph, NodeValue, ValueNode } from "./graph"
import LatLngLiteral = google.maps.LatLngLiteral

const LAT_LONG_REGEX = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/

function parseLatLng(value: string): google.maps.LatLngLiteral | undefined {
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
  const children: ValueNode<NodeValue>[] = getNode(graph, nodeId).children.map((childId: string) =>
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

export function readProperty(graph: Graph, nodeId: string, key: string): any {
  return readParsedProperty(graph, nodeId, key, (value) => value)
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

export function readColor(graph: Graph, nodeId: string): string | undefined {
  return readParsedProperty<string>(graph, nodeId, "color", (value) =>
    isString(value) ? value : undefined
  )
}

export function getChildIdsWith(
  graph: Graph,
  nodeId: string,
  filter: (node: ValueNode<NodeValue>, graph: Graph) => boolean
): string[] {
  const result: { [id: string]: boolean } = {}
  const node = getNode(graph, nodeId)

  for (const childId of node.children) {
    const childNode = getNode(graph, childId)

    if (filter(childNode, graph)) {
      result[childId] = true
    }

    for (const childOfChildId of getChildIdsWith(graph, childId, filter)) {
      result[childOfChildId] = true
    }
  }

  return Object.keys(result)
}
