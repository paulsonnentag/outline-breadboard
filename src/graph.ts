import { createContext, useContext } from "react"
import { DocHandle, Repo } from "automerge-repo"
import { v4 } from "uuid"
import { isString } from "./utils"

export interface GraphDoc {
  rootNodeIds: string[]
  graph: Graph
}

let GRAPH_DOC: GraphDoc

export async function registerGraphHandle(handle: DocHandle<GraphDoc>) {
  if (GRAPH_DOC) {
    throw new Error("graph handle has already been registered")
  }

  handle.on("change", () => {
    GRAPH_DOC = handle.doc
  })

  GRAPH_DOC = await handle.value()
}

export function getGraph(): Graph {
  if (!GRAPH_DOC) {
    throw new Error("no registered graph handle")
  }

  return GRAPH_DOC.graph
}

export function createGraphDoc(repo: Repo) {
  const handle = repo.create<GraphDoc>()
  handle.change((doc) => {
    const rootNode: ValueNode<string> = {
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

export interface ValueNode<T extends NodeValue> {
  type: "value"
  id: string
  key?: string
  value: T
  children: string[]
  view?: string
  computations?: string[]
  isCollapsed: boolean
}

export interface RefNode {
  type: "ref"
  id: string
  refId: string
  isCollapsed: boolean
  view?: string
  computations?: string[]
}

export type Node = ValueNode<NodeValue> | RefNode

type PropDef = [string, string | undefined] | NodeValue | undefined

export interface RecordDef {
  id?: string
  name: string
  props: PropDef[]
}

export function createRecordNode(
  graph: Graph,
  { id = v4(), name, props }: RecordDef
): ValueNode<string> {
  const recordNode: ValueNode<string> = createValueNode(graph, { id, value: name })

  for (const prop of props) {
    // key / property
    if (prop instanceof Array) {
      const [key, value] = prop

      // skip undefined values
      if (value !== undefined) {
        const propertyNode = createValueNode(graph, { value: `${key}: ${value}` })
        recordNode.children.push(propertyNode.id)
      }

      // property without key
    } else if (prop !== undefined) {
      const propertyNode = createValueNode(graph, { value: prop })
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

export function createValueNode<T extends NodeValue>(
  graph: Graph,
  nodeDef: NodeDef<T>
): ValueNode<T> {
  const { id = v4(), value, children = [] } = nodeDef

  const node: ValueNode<T> = {
    type: "value",
    id,
    value,
    children,
    isCollapsed: false,
  }

  graph[node.id] = node

  return getNode<T>(graph, node.id)
}

export function createRefNode(graph: Graph, nodeId: string): RefNode {
  const refNode: RefNode = {
    type: "ref",
    id: v4(),
    refId: nodeId,
    isCollapsed: false,
  }

  graph[refNode.id] = refNode

  return graph[refNode.id] as RefNode
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

export function getNode<T extends NodeValue>(graph: Graph, nodeId: string): ValueNode<T> {
  const node = graph[nodeId]

  return node.type === "ref" ? getNode<T>(graph, node.refId) : node
}

export function isNodeCollapsed(graph: Graph, nodeId: string): boolean {
  return graph[nodeId].isCollapsed
}

export function getLabelOfNode(node: ValueNode<NodeValue>): string {
  if (isString(node.value)) {
    return node.value
  }

  return node.value.type
}
