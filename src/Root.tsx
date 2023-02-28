import { DocumentId } from "automerge-repo"
import { useStore } from "./store"
import { useDocument } from "automerge-repo-react-hooks";
import { createContext, useMemo } from "react";
import { Graph, GraphContext, GraphDoc } from "./graph";
import { NodeEditor } from "./NodeEditor";

interface RootProps {
  documentId: DocumentId
}

export function Root({ documentId }: RootProps) {
  const [doc, setDoc] = useDocument<GraphDoc>(documentId)

  const graphContext = useMemo(() => (
    doc ?
      {
        graph: doc?.graph,
        setGraph: (fn: (graph: Graph) => void) => setDoc((doc) => fn(doc.graph))
      } : undefined
  ), [doc?.graph, setDoc])

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}><NodeEditor id={doc.rootId} /></GraphContext.Provider>
  )
}


