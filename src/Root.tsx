import { DocumentId } from "automerge-repo"
import { MouseEventHandler, useEffect, useMemo, useState } from "react"
import {
  createValueNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  GraphDoc,
  ValueNode,
} from "./graph"

import { OutlineEditor, OutlineEditorProps } from "./editor/OutlineEditor"
import { IconButton } from "./IconButton"
import classNames from "classnames"
import { isString } from "./utils"
import { useRootScope } from "./language/scopes"
import { useDocumentWithHistory } from "./history"

interface RootProps {
  documentId: DocumentId
  disableEval: boolean
}

export function Root({ documentId, disableEval }: RootProps) {
  const [doc, changeDoc, history] = useDocumentWithHistory<GraphDoc>(documentId)
  const [selectedPath, setSelectedPath] = useState<number[] | undefined>(undefined)
  const [focusOffset, setFocusOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggedOverDelete, setIsDraggedOverDelete] = useState(false)
  const [isHoveringOverId, setIsHoveringOverId] = useState<string | undefined>(undefined)

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

  const firstRootNodeId = doc?.rootNodeIds[0]
  const firstRootNode: ValueNode | undefined =
    firstRootNodeId && graphContext ? getNode(graphContext.graph, firstRootNodeId) : undefined

  useEffect(() => {
    document.title =
      firstRootNode?.value && isString(firstRootNode?.value) ? firstRootNode.value : "Breadboard"
  }, [firstRootNode?.value])

  if (!graphContext || !doc) {
    return null
  }

  return (
    <GraphContext.Provider value={graphContext}>
      <div className="p-4 bg-gray-50 flex gap-4 w-screen h-screen items-middle relative">
        {doc.rootNodeIds.map((rootId, index) => {
          const selectedSubPath =
            selectedPath && selectedPath[0] === index ? selectedPath.slice(1) : undefined

          let width: number = doc.graph[rootId].paneWidth || 600

          return (
            <div key={index} className="flex-none flex gap-4">
              <div
                className="p-6 bg-white border border-gray-200 relative overflow-auto flex-none"
                style={{ width: `${width}px` }}
              >
                <div className="absolute top-1 right-1 z-50">
                  <IconButton icon="close" onClick={() => onCloseRootNodeAt(index)} />
                </div>
                <RootOutlineEditor
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
                  disableEval={disableEval}
                  onOpenNodeInNewPane={onOpenNodeInNewPane}
                  isHoveringOverId={isHoveringOverId}
                  setIsHoveringOverId={setIsHoveringOverId}
                />
              </div>
              <WidthAdjust
                startingWidth={width}
                setNewWidth={(newWidth) => {
                  graphContext.changeGraph((graph) => {
                    graph[rootId].paneWidth = newWidth
                  })
                }}
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

interface WidthAdjustProps {
  startingWidth: number
  setNewWidth: (newWidth: number) => void
}

export function WidthAdjust(props: WidthAdjustProps) {
  const handler: MouseEventHandler = (mouseDownEvent) => {
    const startSize = props.startingWidth
    const startPosition = mouseDownEvent.pageX

    function onMouseMove(mouseMoveEvent: MouseEvent) {
      props.setNewWidth(startSize - startPosition + mouseMoveEvent.pageX)
      mouseMoveEvent.preventDefault()
      mouseMoveEvent.stopPropagation()
    }

    function onMouseUp() {
      document.body.removeEventListener("mousemove", onMouseMove)
    }

    document.body.addEventListener("mousemove", onMouseMove)
    document.body.addEventListener("mouseup", onMouseUp, { once: true })
  }

  return (
    <div className="flex flex-col justify-center h-full">
      <div
        className="w-1 h-32 rounded-full bg-gray-300 hover:bg-gray-600 transition-all"
        onMouseDown={handler}
      ></div>
    </div>
  )
}

type RootOutlineEditorProps = Omit<OutlineEditorProps, "scope"> & {
  disableEval: boolean
}

export function RootOutlineEditor(props: RootOutlineEditorProps) {
  const { nodeId } = props
  const scope = useRootScope(nodeId, { disableEval: props.disableEval })

  if (!scope) {
    return null
  }

  return <OutlineEditor scope={scope} {...props} />
}
