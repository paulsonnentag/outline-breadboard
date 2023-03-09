import { DocumentId } from "automerge-repo"
import { useEffect, useMemo, useState } from "react"
import { createNode, Graph, GraphContext, GraphContextProps, GraphDoc } from "./graph"
import { OutlineEditor } from "./OutlineEditor"
import { useDocumentWithHistory } from "./history"
import { IconButton } from "./IconButton"

interface RootProps {
  documentId: DocumentId
}

export function Root({ documentId }: RootProps) {
  const [doc, changeDoc, history] = useDocumentWithHistory<GraphDoc>(documentId)
  const [selectedPath, setSelectedPath] = useState<number[] | undefined>(undefined)

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
      const newRootNode = createNode(doc.graph, {
        value: "",
      })

      doc.rootNodeIds.push(newRootNode.id)
      setSelectedPath([doc.rootNodeIds.length - 1])
    })
  }

  const onOpenNodeInNewPane = (nodeId: string) => {
    changeDoc((doc) => {
      doc.rootNodeIds.push(nodeId)
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
              <div className="absolute top-2 right-2 z-50">
                <IconButton icon="close" onClick={() => onCloseRootNodeAt(index)} />
              </div>

              <OutlineEditor
                index={0}
                nodeId={rootId}
                path={[]}
                parentIds={[]}
                selectedPath={selectedSubPath}
                onChangeSelectedPath={(newSelectedSubPath) => {
                  const newPath = newSelectedSubPath
                    ? [index].concat(newSelectedSubPath)
                    : undefined

                  console.log(newPath)

                  setSelectedPath(newPath)
                }}
                onOpenNodeInNewPane={onOpenNodeInNewPane}
              />
            </div>
          )
        })}

        <IconButton icon="add" onClick={onAddRootNode} />
      </div>
    </GraphContext.Provider>
  )
}
