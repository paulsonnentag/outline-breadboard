import { DocumentId } from "automerge-repo"
import { MouseEventHandler, useEffect, useMemo, useState } from "react"
import {
  createValueNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  GraphDoc,
  useGraph,
  ValueNode,
} from "./graph"

import { OutlineEditor, OutlineEditorProps } from "./editor/OutlineEditor"
import { IconButton } from "./IconButton"
import classNames from "classnames"
import { isString } from "./utils"
import { useRootScope } from "./language/scopes"
import { useDocument } from "automerge-repo-react-hooks"

interface RootProps {
  documentId: DocumentId
  disableEval: boolean
}

const DEFAULT_WIDTH = 800

export function Root({ documentId, disableEval }: RootProps) {
  const [doc, changeDoc] = useDocument<GraphDoc>(documentId)
  const [selectedPath, setSelectedPath] = useState<number[] | undefined>(undefined)
  const [focusOffset, setFocusOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggedOverDelete, setIsDraggedOverDelete] = useState(false)
  const [isHoveringOverId, setIsHoveringOverId] = useState<string | undefined>(undefined)
  const [selectedTabIndex, setSelectedTabIndex] = useState<number>(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>()

  /*
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
  }, [history]) */

  const graphContext: GraphContextProps | undefined = useMemo(
    () =>
      doc
        ? {
            graph: doc.graph,
            changeGraph: (fn: (graph: Graph) => void) => changeDoc((doc) => fn(doc.graph)),
            setIsDragging,
            settingsNodeId: doc.settingsNodeId,
          }
        : undefined,
    [doc?.graph, changeDoc]
  )

  const onCloseRootNode = (tabIndex: number, index: number) => {
    changeDoc((doc) => {
      const tab = doc.tabs[tabIndex]

      tab.splice(index, 1)

      // delete tab if it's empty
      if (tab.length === 0) {
        doc.tabs.splice(tabIndex, 1)

        if (tabIndex < selectedTabIndex) {
          setSelectedTabIndex(selectedTabIndex - 1)
        } else if (!tab[selectedTabIndex]) {
          setSelectedTabIndex(doc.tabs.length - 1)
        }
      }
    })
  }

  const onAddRootNode = () => {
    changeDoc((doc) => {
      const newRootNode = createValueNode(doc.graph, {
        value: "",
      })

      doc.tabs[selectedTabIndex].push(newRootNode.id)
      setSelectedPath([doc.tabs[selectedTabIndex].length - 1])
    })
  }

  const onAddNewDocument = () => {
    changeDoc((doc) => {
      const newRootNode = createValueNode(doc.graph, {
        value: "",
      })

      doc.tabs.push([newRootNode.id])
      setSelectedTabIndex(doc.tabs.length - 1)
    })
  }

  const onOpenSettingsNode = () => {
    changeDoc((doc) => {
      doc.tabs[selectedTabIndex].push(doc.settingsNodeId)
    })
  }

  const onOpenNodeInNewPane = (nodeId: string) => {
    changeDoc((doc) => {
      doc.tabs[selectedTabIndex].push(nodeId)
      setSelectedPath([doc.tabs[selectedTabIndex].length - 1])
    })
  }

  const firstRootNodeId = selectedTabIndex !== -1 ? doc?.tabs[selectedTabIndex][0] : undefined
  const firstRootNode: ValueNode | undefined =
    firstRootNodeId && graphContext ? getNode(graphContext.graph, firstRootNodeId) : undefined

  useEffect(() => {
    document.title =
      firstRootNode?.value && isString(firstRootNode?.value) ? firstRootNode.value : "Breadboard"
  }, [firstRootNode?.value])

  if (!graphContext || !doc) {
    return null
  }

  const activeRootIds = doc.tabs[selectedTabIndex]

  return (
    <GraphContext.Provider value={graphContext}>
      <div className="flex">
        <Sidebar
          tabs={doc.tabs}
          selectedTabIndex={selectedTabIndex}
          onChangeSelectedTabIndex={setSelectedTabIndex}
          onAddNewDocument={onAddNewDocument}
          onOpenSettings={() => {
            setIsSettingsOpen(true)
            setSelectedTabIndex(-1)
          }}
          onCloseRootNode={onCloseRootNode}
        />

        <div className="p-4 bg-gray-50 flex w-full h-screen items-middle relative overflow-auto">
          {isSettingsOpen && (
            <div
              className="p-6 bg-white border border-gray-200 relative overflow-auto flex-none rounded-md"
              style={{ width: `${DEFAULT_WIDTH}px` }}
            >
              <div className="absolute top-1 right-1 z-50">
                <IconButton icon="close" onClick={() => setIsSettingsOpen(false)} />
              </div>
              <RootOutlineEditor
                index={0}
                nodeId={doc.settingsNodeId}
                path={[]}
                parentIds={[]}
                selectedPath={selectedPath}
                focusOffset={focusOffset}
                onChangeSelectedPath={(newPath, newFocusOffset = 0) => {
                  setSelectedPath(newPath)
                  setFocusOffset(newFocusOffset)
                }}
                disableEval={disableEval}
                onOpenNodeInNewPane={onOpenNodeInNewPane}
                isHoveringOverId={isHoveringOverId}
                setIsHoveringOverId={setIsHoveringOverId}
              />
            </div>
          )}

          {activeRootIds &&
            !isSettingsOpen &&
            activeRootIds.map((rootId, index) => {
              const selectedSubPath =
                selectedPath && selectedPath[0] === index ? selectedPath.slice(1) : undefined

              let width: number = doc.graph[rootId].paneWidth || DEFAULT_WIDTH

              return (
                <div key={index} className="flex">
                  <div
                    className="p-6 bg-white border border-gray-200 relative overflow-auto flex-none rounded-md"
                    style={{ width: `${width}px` }}
                  >
                    <div className="absolute top-1 right-1 z-50">
                      <IconButton
                        icon="close"
                        onClick={() => onCloseRootNode(selectedTabIndex, index)}
                      />
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
                  <div className="flex flex-col justify-center items-center gap-2 w-[30px]">
                    {index + 1 === activeRootIds.length && (
                      <IconButton icon="add" onClick={onAddRootNode} />
                    )}

                    <WidthAdjust
                      startingWidth={width}
                      setNewWidth={(newWidth) => {
                        graphContext.changeGraph((graph) => {
                          graph[rootId].paneWidth = newWidth
                        })
                      }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
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
    <div
      className="w-1 h-32 rounded-full bg-gray-300 hover:bg-gray-600 transition-all"
      onMouseDown={handler}
    ></div>
  )
}

type RootOutlineEditorProps = Omit<OutlineEditorProps, "scope"> & {
  disableEval?: boolean
}

export function RootOutlineEditor(props: RootOutlineEditorProps) {
  const { nodeId } = props
  const scope = useRootScope(nodeId, { disableEval: props.disableEval === true })

  if (!scope) {
    return null
  }

  return <OutlineEditor scope={scope} {...props} />
}

interface SidebarProps {
  tabs: string[][]
  selectedTabIndex: number
  onChangeSelectedTabIndex: (tab: number) => void
  onOpenSettings: () => void
  onAddNewDocument: () => void
  onCloseRootNode: (tabIndex: number, rootNodeIndex: number) => void
}

function Sidebar({
  tabs,
  onAddNewDocument,
  selectedTabIndex,
  onChangeSelectedTabIndex,
  onOpenSettings,
  onCloseRootNode,
}: SidebarProps) {
  const { graph } = useGraph()

  return (
    <div className="p-4 w-[300px] bg-gray-100 border-r border-r-gray-200 flex-shrink-0 flex flex-col gap-2">
      <div className="flex justify-between">
        <div className="text-xl">Breadboard</div>

        <div className="w-[24px] h-[24px]">
          <IconButton icon="settings" onClick={() => onOpenSettings()} />
        </div>
      </div>

      <div className="flex-col gap-1">
        {tabs.map((rootNodeIds, tabIndex) => {
          const isSelected = tabIndex === selectedTabIndex

          return (
            <div
              className={classNames("rounded-md p-1 flex gap-1 cursor-pointer", {
                "bg-white shadow": isSelected,
                "hover:bg-gray-200": !isSelected,
              })}
              onClick={() => onChangeSelectedTabIndex(tabIndex)}
              key={tabIndex}
            >
              {rootNodeIds.map((rootNodeId, rootNodeIndex) => {
                const node = getNode(graph, rootNodeId)
                const label = node.value === "" ? "Untitled" : node.value

                return (
                  <div
                    key={rootNodeIndex}
                    className={classNames(
                      "p-1 rounded-md w-fit whitespace-nowrap overflow-ellipsis overflow-hidden flex",
                      {
                        "bg-gray-100": rootNodeIds.length > 1 && isSelected,
                      }
                    )}
                  >
                    {label}{" "}
                    <div className="w-[24px] h-[24px]">
                      <IconButton
                        icon="close"
                        onClick={() => onCloseRootNode(tabIndex, rootNodeIndex)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <button
        className="flex gap-1 text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-md items-center"
        onClick={onAddNewDocument}
      >
        <div className="w-[24px] h-[24px]">
          <span className="material-icons ">add</span>
        </div>{" "}
        New Document
      </button>
    </div>
  )
}
