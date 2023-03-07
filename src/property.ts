import { getNode, Graph } from "./graph"

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
    const result: NodeData = { id: childId, data: {} }

    for (const property of properties) {
      const values = property.readValueOfNode(graph, childId)

      if (values.length === 0) {
        return []
      }

      result.data[property.key] = values
    }

    return result
  })
}

export class Property<T> {
  private regex: RegExp

  constructor(readonly key: string, private parser: (value: string) => T | undefined) {
    this.regex = new RegExp(`^${key}:`)
  }

  matchesValue(value: string): boolean {
    return this.regex.test(value)
  }

  parseValue(value: string): T | undefined {
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
