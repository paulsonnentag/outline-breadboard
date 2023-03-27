// OLD METHOD that parse key value parse, use properties.ts instead

import { getNode, Graph } from "./graph"
import { isString } from "./utils"

export interface NodeData {
  id: string
  data: { [key: string]: unknown[] }
}

export function readChildrenWithProperties(
  graph: Graph,
  nodeId: string,
  properties: Property<unknown>[]
): NodeData[] {
  const node = getNode(graph, nodeId)

  return node.children.flatMap((childId) => {
    const childNode = getNode(graph, childId)
    const nodeData = readNodeWithProperties(graph, childId, properties)

    return (nodeData ? [nodeData] : []).concat(
      childNode.children
        .map((id) => readNodeWithProperties(graph, id, properties))
        .filter((r) => r !== undefined) as NodeData[]
    )
  })
}

function readNodeWithProperties(
  graph: Graph,
  nodeId: string,
  properties: Property<unknown>[]
): NodeData | undefined {
  const result: NodeData = { id: nodeId, data: {} }

  for (const property of properties) {
    const values = property.readValueOfNode(graph, nodeId)

    if (values.length === 0) {
      return undefined
    }

    result.data[property.key] = values
  }

  return result
}

export class Property<T> {
  private regex: RegExp

  constructor(readonly key: string, private parser: (value: string) => T | undefined) {
    this.regex = new RegExp(`^${key}:`)
  }

  matchesValue(value: string): boolean {
    return isString(value) && this.regex.test(value)
  }

  parseValue(value: string): T | undefined {
    if (!isString(value)) {
      return
    }

    const content = value.slice(this.key.length + 1).trim()
    return this.parser(content)
  }

  getChildIndexesOfNode(graph: Graph, nodeId: string): number[] {
    const indexes: number[] = []

    const node = getNode(graph, nodeId)

    for (let i = 0; i < node.children.length; i++) {
      const childNode = getNode(graph, node.children[i])
      if (this.matchesValue(childNode.value)) {
        indexes.push(i)
      }
    }

    return indexes
  }

  readValueOfNode(graph: Graph, nodeId: string): T[] {
    const values = []

    const node = getNode(graph, nodeId)
    for (const childId of node.children) {
      const childNode = getNode(graph, childId)

      if (!this.matchesValue(childNode.value)) {
        continue
      }

      const value = this.parseValue(childNode.value)

      if (value !== undefined) {
        values.push(value)
      }
    }

    return values
  }
}
