import { createContext, useContext } from "react"
import { DocHandle, Repo } from "automerge-repo"
import { v4 } from "uuid"
import { isString } from "./utils"
import { parseFormula } from "./formulas"

export interface GraphDoc {
  rootNodeIds: string[]
  cache: { [key: string]: any }
  graph: Graph
}

let GRAPH_DOC: GraphDoc
let GRAPH_DOC_HANDLE: DocHandle<GraphDoc>

export async function registerGraphHandle(handle: DocHandle<GraphDoc>) {
  if (GRAPH_DOC) {
    throw new Error("graph handle has already been registered")
  }

  handle.on("change", () => {
    GRAPH_DOC = handle.doc
  })

  GRAPH_DOC_HANDLE = handle
  GRAPH_DOC = await handle.value()
}

export function getGraph(): Graph {
  if (!GRAPH_DOC) {
    throw new Error("no registered graph handle")
  }

  return GRAPH_DOC.graph
}

export function getGraphDocHandle() {
  if (!GRAPH_DOC_HANDLE) {
    throw new Error("not registered graph handle")
  }

  return GRAPH_DOC_HANDLE
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
      isSelected: false,
    }

    doc.cache = {}

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

export interface ValueNode {
  type: "value"
  id: string
  key?: string
  value: string
  children: string[]
  view?: string
  computations?: string[]
  isCollapsed: boolean
  isSelected: boolean
}

export interface RefNode {
  type: "ref"
  id: string
  refId: string
  isCollapsed: boolean
  view?: string
  computations?: string[]
}

export type Node = ValueNode | RefNode

type PropDef = [string, string | undefined] | undefined | RecordDef

export interface RecordDef {
  id?: string
  name: string
  props: PropDef[]
}

export function createRecordNode(graph: Graph, { id = v4(), name, props }: RecordDef): ValueNode {
  const recordNode: ValueNode = createValueNode(graph, { id, value: name })

  for (const prop of props) {
    // key / value
    if (prop instanceof Array) {
      const [key, value] = prop

      // skip undefined values
      if (value !== undefined) {
        const propertyNode = createValueNode(graph, { value, key })
        recordNode.children.push(propertyNode.id)
      }

      // record def
    } else if (typeof prop === "object") {
      const propertyNode = createRecordNode(graph, prop)
      recordNode.children.push(propertyNode.id)

      // property without key
    } else if (prop !== undefined) {
      const propertyNode = createValueNode(graph, { value: prop })
      recordNode.children.push(propertyNode.id)
    }
  }

  return recordNode
}

interface NodeDef {
  id?: string
  value: string
  key?: string
  children?: string[]
}

export function createValueNode(graph: Graph, nodeDef: NodeDef): ValueNode {
  const { id = v4(), value, key, children = [] } = nodeDef

  const node: ValueNode = {
    type: "value",
    id,
    value: key ? `${key}: ${value}` : value,
    children,
    isCollapsed: false,
    isSelected: false,
  }

  if (key) {
    node.key = key
  }

  graph[node.id] = node

  return getNode(graph, node.id)
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

export function createNodeTree(graph: Graph, parentId: string, data: any): NodeDef {
  const parent = getNode(graph, parentId)

  if (Array.isArray(data)) {
    data.forEach((childData, index) => {
      const childNode = createValueNode(graph, { value: index.toString() })
      childNode.isCollapsed = true
      parent.children.push(childNode.id)
      createNodeTree(graph, childNode.id, childData)
    })
  } else if (data instanceof Object) {
    Object.entries(data).forEach(([key, childData]) => {
      if (childData instanceof Object || Array.isArray(childData)) {
        const childNode = createValueNode(graph, { value: key })
        childNode.isCollapsed = true
        parent.children.push(childNode.id)
        createNodeTree(graph, childNode.id, childData)
      } else if (childData) {
        const childNode = createValueNode(graph, { key, value: childData.toString() })
        parent.children.push(childNode.id)
      }
    })
  } else if (data !== undefined) {
    const childNode = createValueNode(graph, { value: data.toString() })
    parent.children.push(childNode.id!)
  }

  return parent;
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

export function getNode(graph: Graph, nodeId: string): ValueNode {
  const node = graph[nodeId]

  return node.type === "ref" ? getNode(graph, node.refId) : node
}

export function getChildNodeByValue(graph: Graph, parentNode: NodeDef, childValue: string): ValueNode | undefined {
  for (const childId of parentNode.children || []) {
    const childNode = getNode(graph, childId)
    if (childNode.value === childValue) {
      return childNode
    }
  }
  return undefined
}

export function isNodeCollapsed(graph: Graph, nodeId: string): boolean {
  return graph[nodeId].isCollapsed
}

export function getLabelOfNode(node: ValueNode): string {
  return node.value
}
