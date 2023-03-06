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
import { IconButton } from "./IconButton"
import { v4 } from "uuid"

interface RootProps {
  documentId: DocumentId
}

export function Root({ documentId }: RootProps) {
  const [doc, changeDoc, history] = useDocumentWithHistory<GraphDoc>(documentId)
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

  const onCloseRootNodeAt = (index: number) => {
    changeDoc((doc) => {
      delete doc.rootNodeIds[index]
    })
  }

  const onAddRootNode = () => {
    changeDoc((doc) => {
      const newRootNode = {
        id: v4(),
        value: "",
        children: [],
      }

      doc.graph[newRootNode.id] = newRootNode
      doc.rootNodeIds.push(newRootNode.id)
      setSelectedPath([doc.rootNodeIds.length - 1])
    })
  }

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}>
      <div className="p-4 bg-gray-50 flex gap-4 w-screen h-screen items-middle">
        {doc.rootNodeIds.map((rootId, index) => {
          const selectedSubPath =
            selectedPath && selectedPath[0] === index ? selectedPath.slice(1) : undefined

          return (
            <div
              className="p-4 bg-white border border-gray-200 max-w-2xl flex-1 relative overflow-auto"
              key={index}
            >
              <div className="absolute top-4 right-4 z-50">
                <IconButton icon="close" onClick={() => onCloseRootNodeAt(index)} />
              </div>

              <NodeEditor
                index={0}
                id={rootId}
                path={[]}
                parentIds={[]}
                selectedPath={selectedSubPath}
                onChangeSelectedPath={(newSelectedSubPath) => {
                  console.log("change path", [index].concat(newSelectedSubPath))

                  setSelectedPath([index].concat(newSelectedSubPath))
                }}
              />
            </div>
          )
        })}

        <IconButton icon="add" onClick={onAddRootNode} />
      </div>
    </GraphContext.Provider>
  )
}
