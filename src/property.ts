import { Graph } from "./graph"

export interface NodeData {
  id: string
  data: { [key: string]: unknown[] }
}

export function readChildrenWithProperties(
  graph: Graph,
  nodeId: string,
  properties: Property<unknown>[]
): NodeData[] {
  const node = graph[nodeId]

  return node.children.flatMap((childId) => {
    const childNode = graph[childId]

    const result = { id: childId, data: {} }

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

  readValueOfNode(graph: Graph, nodeId: string): T[] {
    const values = []

    const node = graph[nodeId]
    for (const childId of node.children) {
      const childNode = graph[childId]

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
