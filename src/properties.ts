import { isString } from "./utils"
import { getNode, Graph, ValueNode } from "./graph"
import LatLngLiteral = google.maps.LatLngLiteral
import { evalBullet, getReferencedNodeIds } from "./formulas"

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

export function parseDateRefsInString(string: string): DataWithProvenance<Date>[] {
  return getReferencedNodeIds(string).flatMap((nodeId) => {
    return parseDate(nodeId) ?? []
  })
}

export function parseDate(string: string): DataWithProvenance<Date> | undefined {
  const match = string.match(DATE_REF_REGEX)

  if (!match) {
    return undefined
  }

  const month = parseInt(match[1], 10)
  const day = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  return { nodeId: string, data: new Date(year, month - 1, day), parentIds: [] } // todo: add properParentIds
}

// read position property or referencedLocations
export function readLatLngsOfNode(
  graph: Graph,
  nodeId: string
): DataWithProvenance<LatLngLiteral>[] {
  const node = getNode(graph, nodeId)

  const ownPosition = readLatLng(graph, nodeId)
  const referencedNodesPosition = parseReferencedLocationsInString(graph, node.value)
  return ownPosition
    ? referencedNodesPosition.concat({ nodeId, data: ownPosition, parentIds: [] }) // todo: add proper parentIds
    : referencedNodesPosition
}

export function parseReferencedLocationsInString(
  graph: Graph,
  string: string
): DataWithProvenance<LatLngLiteral>[] {
  return getReferencedNodeIds(string).flatMap((referencedNodeId) => {
    const latLng = readLatLng(graph, referencedNodeId)
    return latLng ? [{ nodeId: referencedNodeId, data: latLng, parentIds: [] }] : [] // todo: add proper parentIds
  })
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

export function readColorFromList(graph: Graph, nodeIds: string[]): string | undefined {
  for (var nodeId of nodeIds) {
    let color = readColor(graph, nodeId)

    if (color) {
      return color
    }
  }

  return undefined
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
  parentIds: string[],
  results: [nodeId: string, parentIds: string[], data: T][] = []
) {
  const node = getNode(graph, nodeId)

  for (const referencedId of getReferencedNodeIds(node.value)) {
    const referencedNode = getNode(graph, referencedId)
    const data = extractData(graph, referencedNode)
    if (data) {
      results.push([referencedNode.id, parentIds, data])
    }
  }

  const data = extractData(graph, node)
  if (data) {
    results.push([node.id, parentIds, data])
  }

  for (const childId of node.children) {
    _extractDataInNodeAndBelow(graph, childId, extractData, [...parentIds, node.id], results)
  }
}

export interface DataWithProvenance<T> {
  nodeId: string
  parentIds: string[]
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
): DataWithProvenance<T>[] {
  const results: [nodeId: string, parentIds: string[], data: T][] = []

  _extractDataInNodeAndBelow<T>(graph, nodeId, extractData, [], results)

  return results.map(
    ([nodeId, parentIds, data]) =>
      ({
        nodeId,
        parentIds,
        data,
      } as DataWithProvenance<T>)
  )
}

// we should combine extractComputedValuesInNodeAndBelow with extractDataInNodeAndBelow
// currently we haven't bridget the gap between data that's in the tree and data that is computed in expressions

export async function extractComputedValuesInNodeAndBelow<T>(
  graph: Graph,
  nodeId: string,
  extractData: (value: any) => T | undefined
): Promise<DataWithProvenance<T>[]> {
  return _extractComputedValuesInNodeAndBelow(graph, nodeId, [], extractData)
}

async function _extractComputedValuesInNodeAndBelow<T>(
  graph: Graph,
  nodeId: string,
  parentIds: string[],
  extractData: (value: any) => T | undefined
): Promise<DataWithProvenance<T>[]> {
  const node = getNode(graph, nodeId)

  const bullet = await evalBullet(graph, node.value)

  let results: DataWithProvenance<T>[] = []

  for (const value of bullet?.value ?? []) {
    const data = extractData(value)

    if (data) {
      results.push({ nodeId, parentIds, data })
    }
  }

  const childResults = await Promise.all(
    node.children.map((childId) => {
      return _extractComputedValuesInNodeAndBelow(
        graph,
        childId,
        [...parentIds, nodeId],
        extractData
      )
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
      const value = split.slice(1).join(":")

      if (key !== undefined && value !== undefined) {
        allProps[key] = value
      }
    }
  }

  return allProps
}
