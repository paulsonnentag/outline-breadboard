import { createContext, useContext } from "react"
import { Repo } from "automerge-repo"
import { v4 } from "uuid"

export interface GraphDoc {
  rootNodeIds: string[]
  graph: Graph
}

export function createGraphDoc(repo: Repo) {
  const handle = repo.create<GraphDoc>()
  handle.change((doc) => {
    const rootNode: ValueNode = {
      id: v4(),
      type: "value",
      value: "",
      children: [],
      isCollapsed: false,
    }

    doc.graph = {
      [rootNode.id]: rootNode,
    }
    doc.rootNodeIds = [rootNode.id]
  })

  return handle
}

export interface Graph {
  [id: string]: Node
}

export interface ImageValue {
  type: "image"
  url: string
}

export type NodeValue = string | ImageValue

export interface ValueNode {
  type: "value"
  id: string
  children: string[]
  value: NodeValue
  view?: string
  computations?: string[]
  isCollapsed: boolean
}

export interface RefNode {
  type: "ref"
  id: string
  refId: string
  view?: string
  isCollapsed: boolean
}

export type Node = ValueNode | RefNode

type PropDef = [string, string | undefined] | NodeValue | undefined

export interface RecordDef {
  id?: string
  name: string
  props: PropDef[]
}

export function createRefNode(graph: Graph, refId: string): RefNode {
  const node: RefNode = {
    type: "ref",
    id: v4(),
    isCollapsed: false,
    refId,
  }

  graph[node.id] = node
  return graph[node.id] as RefNode
}

export function createRecordNode(graph: Graph, { id = v4(), name, props }: RecordDef): ValueNode {
  const recordNode = createNode(graph, { id, value: name })

  for (const prop of props) {
    // key / property
    if (prop instanceof Array) {
      const [key, value] = prop

      // skip undefined values
      if (value !== undefined) {
        const propertyNode = createNode(graph, { value: `${key}: ${value}` })
        recordNode.children.push(propertyNode.id)
      }

      // property without key
    } else if (prop !== undefined) {
      const propertyNode = createNode(graph, { value: prop })
      recordNode.children.push(propertyNode.id)
    }
  }

  return recordNode
}

interface NodeDef {
  id?: string
  value: NodeValue
  children?: string[]
}

export function createNode(graph: Graph, { id = v4(), value, children = [] }: NodeDef): ValueNode {
  const node: ValueNode = {
    type: "value",
    id,
    value,
    children,
    isCollapsed: false,
  }

  graph[node.id] = node

  return getNode(graph, node.id) as ValueNode // need to lookup the node again to get a mutable version
}

export interface GraphContextProps {
  graph: Graph
  changeGraph: (fn: (graph: Graph) => void) => void
  setIsDragging: (isDragging: boolean) => void
}

export const GraphContext = createContext<GraphContextProps | undefined>(undefined)

export function useGraph(): GraphContextProps {
  const context = useContext(GraphContext)

  if (!context) {
    throw new Error("missing graph context")
  }

  return context
}

// todo: this assumes that you don't have cycles in your graph
export function getNode(graph: Graph, nodeId: string): ValueNode {
  const node = graph[nodeId]

  if (node.type === "value") {
    return node
  }

  return getNode(graph, node.refId)
}

export function isReferenceNodeId(graph: Graph, nodeId: string): boolean {
  return graph[nodeId].type === "ref"
}

export function isNodeCollapsed(graph: Graph, nodeId: string): boolean {
  return graph[nodeId].isCollapsed
}

export function resolveNode(graph: Graph, node: Node): ValueNode {
  if (node.type === "value") {
    return node
  }

  return getNode(graph, node.refId)
}
