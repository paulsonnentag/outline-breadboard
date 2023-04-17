import { isString } from "./utils"
import { getNode, Graph, ValueNode } from "./graph"
import LatLngLiteral = google.maps.LatLngLiteral
import { getReferencedNodeIds } from "./language"
import { Scope } from "./language/scopes"
import { IdRefNode, InlineExprNode } from "./language/ast"

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

export function parseDateRefsInScopeValue(scope: Scope): Date[] {
  const dates: Date[] = []

  console.log(scope.bullet.value)

  for (const astNode of scope.bullet.value) {
    if (astNode instanceof InlineExprNode && astNode.expr instanceof IdRefNode) {
      const date = parseDate(astNode.expr.id)

      if (date !== undefined) {
        dates.push(date)
      }
    }
  }

  return dates
}

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

export interface DataWithProvenance<T> {
  nodeId: string
  parentIds: string[]
  data: T
}
