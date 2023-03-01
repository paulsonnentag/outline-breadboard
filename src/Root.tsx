import { DocumentId } from "automerge-repo"
import { useDocument, useHandle } from "automerge-repo-react-hooks"
import { useCallback, useMemo, useState } from "react"
import { createDefaultGraph, Graph, GraphContext, GraphContextProps, GraphDoc } from "./graph"
import { NodeEditor } from "./NodeEditor"

interface RootProps {
  documentId: DocumentId
}

export function Root({ documentId }: RootProps) {
  const [doc, changeDoc] = useDocument<GraphDoc>(documentId)
  const handle = useHandle<GraphDoc>(documentId)

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
    if (selectedPath.length === 0) {
      setSelectedPath([0])
    }
  }

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}>
      <div className="p-4 bg-gray-50 w- flex flex-col gap-4 w-screen h-screen">
        <div className="flex items-center gap-2">
          <button
            className="shadow border bg-white border-gray-200 rounded-xl px-2 py-1 w-fit hover:bg-blue-500 hover:text-white"
            onClick={() => createDefaultGraph(handle)}
          >
            Reset graph
          </button>
          <div>
            <span className="text-gray-500 bold">selected path:</span>{" "}
            {JSON.stringify(selectedPath)}
          </div>
        </div>

        <NodeEditor
          index={0}
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
