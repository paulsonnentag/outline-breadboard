import { isString } from "./utils"
import { getNode, Graph, ValueNode } from "./graph"
import LatLngLiteral = google.maps.LatLngLiteral
import { evalBullet, getReferencedNodeIds } from "./formulas"

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

function _extractDataInNodeAndBelow<T>(
  graph: Graph,
  nodeId: string,
  extractData: (graph: Graph, node: ValueNode) => T | undefined,
  results: { [nodeId: string]: T } = {}
) {
  const node = getNode(graph, nodeId)

  for (const referencedId of getReferencedNodeIds(node.value)) {
    const referencedNode = getNode(graph, referencedId)
    const data = extractData(graph, referencedNode)
    if (data) {
      results[referencedNode.id] = data
    }
  }

  const data = extractData(graph, node)
  if (data) {
    results[node.id] = data
  }

  for (const childId of node.children) {
    _extractDataInNodeAndBelow(graph, childId, extractData, results)
  }
}

export interface NodeWithExtractedData<T> {
  nodeId: string
  data: T
}

// recursively traverses the graph and returns a match object that maps nodeId to extracted data

// the recursion iterates over:
// - the node itself
// - all child nodes
// - nodes referenced in expressions in the node or the children

// if the extractData function returns undefined the node is discarded
export function extractDataInNodeAndBelow<T>(
  graph: Graph,
  nodeId: string,
  extractData: (graph: Graph, node: ValueNode) => T | undefined
): NodeWithExtractedData<T>[] {
  const results: { [nodeId: string]: T } = {}

  _extractDataInNodeAndBelow<T>(graph, nodeId, extractData, results)

  return Object.entries(results).map(
    ([nodeId, data]) =>
      ({
        nodeId,
        data,
      } as NodeWithExtractedData<T>)
  )
}

// we should combine extractComputedValuesInNodeAndBelow with extractDataInNodeAndBelow
// currently we haven't bridget the gap between data that's in the tree and data that is computed in expressions

export async function extractComputedValuesInNodeAndBelow<T>(
  graph: Graph,
  nodeId: string,
  extractData: (value: any) => T | undefined
): Promise<NodeWithExtractedData<T>[]> {
  const node = getNode(graph, nodeId)

  const bullet = await evalBullet(graph, node.value)

  let results: NodeWithExtractedData<T>[] = []

  for (const value of bullet?.value ?? []) {
    const data = extractData(value)

    if (data) {
      results.push({ nodeId, data })
    }
  }

  const childResults = await Promise.all(
    node.children.map((childId) => {
      return extractComputedValuesInNodeAndBelow(graph, childId, extractData)
    })
  )

  for (const childResult of childResults) {
    results = results.concat(childResult)
  }

  return results
}

export function readAllProperties(graph: Graph, nodeId: string) {
  interface KeyValueDict {
    [key: string]: any
  }

  let allProps: KeyValueDict = {}

  const children: ValueNode[] = getNode(graph, nodeId).children.map((childId: string) =>
    getNode(graph, childId)
  )

  for (const childNode of children) {
    if (childNode.value.includes(":")) {
      const split = childNode.value.split(":")
      const key = split[0]
      const value = split[1]

      if (key !== undefined && value !== undefined) {
        allProps[key] = value
      }
    }
  }

  return allProps
}
