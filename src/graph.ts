import { createContext, useContext, useEffect, useState } from "react"
import { DocHandle, DocHandleChangeEvent, DocumentId, Repo } from "automerge-repo"
import { v4 } from "uuid"
import { Doc } from "@automerge/automerge"
import { Change, useRepo } from "automerge-repo-react-hooks"

export interface GraphDoc {
  tabs: string[][]
  settingsNodeId: string
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
    doc.cache = {}
    doc.graph = {}

    const rootNode = createValueNode(doc.graph, { value: "" })

    const settingsNode = createRecordNode(doc.graph, {
      name: "Settings",
      props: [
        ["lengthUnit", "kilometers"],
        ["temperatureUnit", "celsius"],
      ],
    })

    doc.settingsNodeId = settingsNode.id
    doc.tabs = [[rootNode.id]]
  })

  return handle
}

export interface Graph {
  [id: string]: Node
}

export interface ValueNode {
  type: "value"
  id: string
  key?: string
  value: string
  children: string[]
  view?: string
  paneWidth?: number
  computations?: string[]
  computedProps: {
    [name: string]: any
  }
  isCollapsed: boolean
  isSelected: boolean
  expandedResultsByIndex: { [index: number]: boolean }
  isTemporary?: boolean
}

export interface RefNode {
  type: "ref"
  id: string
  refId: string
  isCollapsed: boolean
  view?: string
  paneWidth?: number
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
  isTemporary?: boolean
}

export function createValueNode(graph: Graph, nodeDef: NodeDef): ValueNode {
  const { id = v4(), value, key, children = [] } = nodeDef

  const node: ValueNode = {
    type: "value",
    id,
    value: key ? `${key}: ${value}` : value,
    children,
    computedProps: {},
    isCollapsed: false,
    isSelected: false,
    expandedResultsByIndex: {},
    isTemporary: nodeDef.isTemporary === true,
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

  return parent
}

export interface GraphContextProps {
  graph: Graph
  settingsNodeId: string
  changeGraph: (fn: (graph: Graph) => void) => void
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

export function getChildNodeByValue(
  graph: Graph,
  parentNode: NodeDef,
  childValue: string
): ValueNode | undefined {
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

export function useGraphDocument(
  documentId: DocumentId | undefined,
  onChangeNode: (graph: Graph, nodeId: string) => void
): [doc: Doc<GraphDoc> | undefined, changeFn: Change<GraphDoc>] {
  const [doc, setDoc] = useState<Doc<GraphDoc>>()
  const repo = useRepo()
  const handle = documentId ? repo.find<GraphDoc>(documentId) : null

  useEffect(() => {
    if (!handle) {
      return
    }
    handle.value().then((v) => setDoc(v as Doc<GraphDoc>))
    const listener = (h: DocHandleChangeEvent<GraphDoc>) => {
      setDoc(h.handle.doc as Doc<GraphDoc>) // TODO: this is kinda gross
    }

    handle.on("change", listener)

    return () => {
      handle.removeListener("change", listener)
    }
  }, [handle])

  const changeDoc = (changeFunction: (d: GraphDoc) => void) => {
    if (!handle) {
      return
    }

    handle.change(changeFunction, {
      patchCallback: (patch, before, after) => {
        const { path, action } = patch

        if (path[0] !== "graph") {
          return
        }

        if (path.length === 3) {
          const [_, nodeId, key] = path
          if (key !== "value") {
            return
          }

          // node might not have children yet, because onChangeNode is called after each operation in the initialization
          if (!getNode(after.graph, nodeId as string).children) {
            return
          }

          // node changed
          onChangeNode(after.graph, nodeId as string)
        } else if (path.length === 4) {
          const [_, nodeId, key, childIndex] = path

          if (key !== "children") {
            return
          }

          // child changed
          onChangeNode(after.graph, nodeId as string)
        }
      },
    })
  }

  return [doc, changeDoc]
}
