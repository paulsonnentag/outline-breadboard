import { createContext, useCallback, useContext } from "react"
import { DocHandle, Repo } from "automerge-repo"
import { v4 } from "uuid"

export interface GraphDoc {
  rootId: string
  graph: Graph
}

export function createGraphDoc(repo: Repo) {
  const handle = repo.create<GraphDoc>()

  createDefaultGraph(handle)

  return handle
}

export function createDefaultGraph(handle: DocHandle<GraphDoc>) {
  handle.change((doc) => {
    const subA1 = {
      id: v4(),
      value: "sub a1",
      children: [],
    }

    const subA2 = {
      id: v4(),
      value: "sub a2",
      children: [],
    }

    const transcluded = {
      id: v4(),
      value: "transcluded",
      children: [],
    }

    const childA = {
      id: v4(),
      value: "child a",
      children: [subA1.id, subA2.id, transcluded.id],
    }

    const subB1 = {
      id: v4(),
      value: "sub b1",
      children: [],
    }

    const childB = {
      id: v4(),
      value: "child b",
      children: [subB1.id, transcluded.id],
    }

    const rootNode = {
      id: v4(),
      value: "Outline",
      children: [childA.id, childB.id],
    }

    doc.rootId = rootNode.id
    doc.graph = {
      [rootNode.id]: rootNode,
      [childA.id]: childA,
      [subA1.id]: subA1,
      [subA2.id]: subA2,
      [transcluded.id]: transcluded,
      [childB.id]: childB,
      [subB1.id]: subB1,
    }
  })
}

export interface Graph {
  [id: string]: Node
}

export interface Node {
  id: string
  children: string[]
  value: string
}

export interface GraphContextProps {
  graph: Graph
  changeGraph: (fn: (graph: Graph) => void) => void
}

export const GraphContext = createContext<GraphContextProps | undefined>(undefined)

export interface NodeContextProps {
  node: Node
  changeNode: (fn: (node: Node) => void) => void
  deleteNode: () => void
}

export function useNode(id: string): NodeContextProps {
  const context = useContext(GraphContext)

  if (!context) {
    throw new Error("missing graph context")
  }

  const { graph, changeGraph } = context

  const node = graph[id]

  const changeNode = useCallback(
    (fn: (node: Node) => void) => {
      changeGraph((graph) => {
        fn(graph[id])
      })
    },
    [changeGraph, id]
  )

  const deleteNode = useCallback(() => {
    changeGraph((graph) => delete graph[id])
  }, [id])

  return { node, changeNode, deleteNode }
}

export function useGraph(): GraphContextProps {
  const context = useContext(GraphContext)

  if (!context) {
    throw new Error("missing graph context")
  }

  return context
}
