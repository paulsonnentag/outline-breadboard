import { createContext, useCallback, useContext } from "react";
import { Repo } from "automerge-repo";
import { v4 } from "uuid";

export interface GraphDoc {
  rootId: string,
  graph: Graph
}

export function createGraphDoc(repo: Repo) {
  const handle = repo.create<GraphDoc>()

  handle.change((doc) => {
    const rootNode = {
      id: v4(),
      value: "root",
      children: []
    }

    doc.rootId = rootNode.id
    doc.graph = {
      [rootNode.id]: rootNode
    }
  })

  return handle
}

export interface Graph {[id: string]: Node}

export interface Node {
  id: string
  children: string[]
  value: string
}

interface GraphContextProps {
  graph: Graph
  setGraph: (fn: (graph: Graph) => void) => void
}

export const GraphContext = createContext<GraphContextProps>({})

export function useNode(id:string) {
  const {graph, setGraph} = useContext(GraphContext)

  const node = graph[id]

  const setNode = useCallback((fn: (node: Node) => void) => {
    setGraph((graph) => { fn(graph[id])})
  }, [setGraph, id])

  const deleteNode = useCallback(() => {
    setGraph((graph) => delete graph[id])
  }, [id])

  return { node, setNode, deleteNode }
}
