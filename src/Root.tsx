import { DocumentId } from "automerge-repo"
import { useHandle } from "automerge-repo-react-hooks"
import { useEffect, useMemo, useState } from "react"
import {
  createEmptyOutline,
  createExampleOutline,
  Graph,
  GraphContext,
  GraphContextProps,
  GraphDoc,
} from "./graph"
import { NodeEditor } from "./NodeEditor"
import { useDocumentWithHistory } from "./history"

interface RootProps {
  documentId: DocumentId
}

const SHOW_HISTORY = false

export function Root({ documentId }: RootProps) {
  const [doc, changeDoc, history] = useDocumentWithHistory<GraphDoc>(documentId)
  const handle = useHandle<GraphDoc>(documentId)

  const [selectedPath, setSelectedPath] = useState<number[]>([])

  useEffect(() => {
    const onKeyPress = (evt: KeyboardEvent) => {
      if (evt.key === "z" && (evt.ctrlKey || evt.metaKey)) {
        if (evt.shiftKey) {
          history.redo()
        } else {
          history.undo()
        }
      }
    }

    document.addEventListener("keydown", onKeyPress)

    return () => {
      document.removeEventListener("keydown", onKeyPress)
    }
  }, [history])

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

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}>
      <div className="p-4 bg-gray-50 w- flex flex-col gap-4 w-screen h-screen">
        <div className="p-4 bg-white border border-gray-200">
          <NodeEditor
            index={0}
            id={doc.rootId}
            path={[]}
            parentIds={[]}
            selectedPath={selectedPath}
            onChangeSelectedPath={setSelectedPath}
          />
        </div>

        <div className="flex gap-2">
          <button
            className="shadow border bg-white border-gray-200 rounded px-2 py-1 w-fit hover:bg-blue-500 hover:text-white"
            onClick={() => createExampleOutline(handle)}
          >
            Example outline
          </button>
          <button
            className="shadow border bg-white border-gray-200 rounded px-2 py-1 w-fit hover:bg-blue-500 hover:text-white"
            onClick={() => createEmptyOutline(handle)}
          >
            Empty outline
          </button>

          <button
            className="shadow border bg-white border-gray-200 rounded px-2 py-1 w-fit hover:bg-blue-500 hover:text-white"
            onClick={() => history.undo()}
          >
            undo
          </button>
          <button
            className="shadow border bg-white border-gray-200 rounded px-2 py-1 w-fit hover:bg-blue-500 hover:text-white"
            onClick={() => history.redo()}
          >
            redo
          </button>
        </div>

        {SHOW_HISTORY && (
          <div>
            <div>
              <b>Undo</b>

              {history.undoStack.map((patches) => (
                <div>
                  {patches.map((patch) => (
                    <div>{JSON.stringify(patch)}</div>
                  ))}
                  <hr></hr>
                </div>
              ))}
            </div>

            <div>
              <b>Redo</b>

              {history.redoStack.map((patches) => (
                <div>
                  {patches.map((patch) => (
                    <div>{JSON.stringify(patch)}</div>
                  ))}
                  <hr></hr>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </GraphContext.Provider>
  )
}
