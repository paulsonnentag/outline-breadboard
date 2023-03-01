import { DocumentId } from "automerge-repo"
import { useDocument } from "automerge-repo-react-hooks"
import { useCallback, useMemo, useState } from "react"
import { Graph, GraphContext, GraphContextProps, GraphDoc } from "./graph"
import { NodeEditor } from "./NodeEditor"

interface RootProps {
  documentId: DocumentId
}

export function Root({ documentId }: RootProps) {
  const [doc, changeDoc] = useDocument<GraphDoc>(documentId)

  const [selectedPath, setSelectedPath] = useState<number[]>([])

  const graphContext: GraphContextProps | undefined = useMemo(
    () =>
      doc
        ? {
            graph: doc?.graph,
            changeGraph: (fn: (graph: Graph) => void) => changeDoc((doc) => fn(doc.graph)),
          }
        : undefined,
    [doc?.graph, changeDoc]
  )

  const onFocusNext = () => {
    console.log("root", selectedPath)

    if (selectedPath.length === 0) {
      setSelectedPath([0])
    }
  }

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}>
      {JSON.stringify(selectedPath)}

      <div className="p-4">
        <NodeEditor
          id={doc.rootId}
          path={[]}
          selectedPath={selectedPath}
          onChangeSelectedPath={setSelectedPath}
          onFocusNext={onFocusNext}
          onFocusPrev={() => {}}
        />
      </div>
    </GraphContext.Provider>
  )
}
