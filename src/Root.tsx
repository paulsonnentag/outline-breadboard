import { DocumentId } from "automerge-repo"
import { useEffect, useMemo, useState } from "react"
import { createValueNode, getNode, Graph, GraphContext, GraphContextProps, GraphDoc } from "./graph"
import { OutlineEditor } from "./OutlineEditor"
import { useDocumentWithHistory } from "./history"
import { IconButton } from "./IconButton"
import classNames from "classnames"

interface RootProps {
  documentId: DocumentId
}

export function Root({ documentId }: RootProps) {
  const [doc, changeDoc, history] = useDocumentWithHistory<GraphDoc>(documentId)
  const [selectedPath, setSelectedPath] = useState<number[] | undefined>(undefined)
  const [focusOffset, setFocusOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggedOverDelete, setIsDraggedOverDelete] = useState(false)

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
            setIsDragging,
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
      const newRootNode = createValueNode(doc.graph, {
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

  const onReplaceRootNodeAt = (index: number, newNodeId: string) => {
    changeDoc((doc) => {
      doc.rootNodeIds[index] = newNodeId
    })
  }

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}>
      <div className="p-4 bg-gray-50 flex gap-4 w-screen h-screen items-middle relative">
        {doc.rootNodeIds.map((rootId, index) => {
          const selectedSubPath =
            selectedPath && selectedPath[0] === index ? selectedPath.slice(1) : undefined

          return (
            <div
              className="p-4 pl-2 bg-white border border-gray-200 max-w-2xl flex-1 relative overflow-auto"
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
                focusOffset={focusOffset}
                onChangeSelectedPath={(newSelectedSubPath, newFocusOffset = 0) => {
                  const newPath = newSelectedSubPath
                    ? [index].concat(newSelectedSubPath)
                    : undefined
                  setSelectedPath(newPath)
                  setFocusOffset(newFocusOffset)
                }}
                onOpenNodeInNewPane={onOpenNodeInNewPane}
                onReplaceNode={(newNodeId) => onReplaceRootNodeAt(index, newNodeId)}
              />
            </div>
          )
        })}

        <IconButton icon="add" onClick={onAddRootNode} />

        {isDragging && (
          <div
            className={classNames(
              "flex border border-dashed px-4 py-2 absolute bottom-4 right-4 rounded",
              isDraggedOverDelete ? "border-red-500 text-red-500" : "border-gray-500"
            )}
            onDragOver={(evt) => {
              evt.stopPropagation()
              evt.preventDefault()
            }}
            onDragEnter={(evt) => {
              evt.stopPropagation()
              evt.preventDefault()
              setIsDraggedOverDelete(true)
            }}
            onDragLeave={() => {
              setIsDraggedOverDelete(false)
            }}
            onDrop={(evt) => {
              const { parentId, index } = JSON.parse(evt.dataTransfer.getData("application/node"))

              // todo: we are not deleting the node itself here in case it's still linked somewhere else
              // these leads to dangling nodes

              graphContext?.changeGraph((graph) => {
                const parent = getNode(graph, parentId)

                delete parent.children[index]
              })
            }}
          >
            <div className="material-icons">delete</div>
            delete
          </div>
        )}
      </div>
    </GraphContext.Provider>
  )
}
