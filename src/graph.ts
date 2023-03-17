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
    const rootNode: Node<string> = {
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
  [id: string]: Node<NodeValue>
}

export interface ImageValue {
  type: "image"
  url: string
}

export interface RefValue {
  type: "ref"
  id: string
}

export type NodeValue = string | ImageValue | RefValue

export function isRef(value: NodeValue): boolean {
  return typeof value === "object" && value.type === "ref"
}

export function createRef(id: string): RefValue {
  return { type: "ref", id }
}

export interface Node<T extends NodeValue> {
  type: "value"
  id: string
  value: T
  children: string[]
  view?: string
  computations?: string[]
  isCollapsed: boolean
}

type PropDef = [string, string | undefined] | NodeValue | undefined

export interface RecordDef {
  id?: string
  name: string
  props: PropDef[]
}

export function createRecordNode(
  graph: Graph,
  { id = v4(), name, props }: RecordDef
): Node<string> {
  const recordNode: Node<string> = createNode(graph, { id, value: name })

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

interface NodeDef<T extends NodeValue> {
  id?: string
  value: T
  children?: string[]
}

export function createNode<T extends NodeValue>(graph: Graph, nodeDef: NodeDef<T>): Node<T> {
  const { id = v4(), value, children = [] } = nodeDef

  const node: Node<T> = {
    type: "value",
    id,
    value,
    children,
    isCollapsed: false,
  }

  graph[node.id] = node

  return getNode<T>(graph, node.id)
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

export function getNode<T extends NodeValue>(graph: Graph, nodeId: string): Node<T> {
  return graph[nodeId] as Node<T>
}

export function isNodeCollapsed(graph: Graph, nodeId: string): boolean {
  return graph[nodeId].isCollapsed
}
