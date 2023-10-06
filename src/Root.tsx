import { DocumentId } from "automerge-repo"
import {
  createContext,
  MouseEvent as ReactMouseEvent,
  MouseEventHandler,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  createGraphDoc,
  createValueNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  GraphDoc,
  registerGraphHandle,
  useGraph,
  TemporaryMapObjects,
  ValueNode,
} from "./graph"
import { save } from "@automerge/automerge"

import { OutlineEditor, OutlineEditorProps } from "./editor/OutlineEditor"
import { IconButton } from "./IconButton"
import classNames from "classnames"
import { downloadTextFile, downloadUint8Array, isString, safeJsonStringify } from "./utils"
import { useRootScope } from "./language/scopes"
import { useDocument, useRepo } from "automerge-repo-react-hooks"
import { importGraph, ProfileDoc } from "./profile"
import fileDialog from "file-dialog"
import Logo from "./Logo"
import { PopoverOutlineView } from "./views/MapNodeView"
import { useStaticCallback } from "./hooks"
import { FnNode, InlineExprNode } from "./language/ast"
import { FUNCTIONS } from "./language/functions"
import {
  DEFAULT_PANEL_WIDTH,
  FIRST_PANEL_WIDTH,
  FIXED_WIDTH_FIRST_PANEL_ENABLED,
  SHOW_CLOSE_BUTTON,
} from "./config"

interface RootProps {
  profileDocId: DocumentId
}

// set in env.local to true to speed up page reloads during development, only the selected document will be loaded
// @ts-ignore
const LOAD_SINGLE_DOC = __APP_ENV__.LOAD_SINGLE_DOC || false

export function Root({ profileDocId }: RootProps) {
  const repo = useRepo()
  const [profile, changeProfile] = useDocument<ProfileDoc>(profileDocId)
  const [selectedGraphId, setSelectedGraphId] = useState<DocumentId | undefined>()

  useEffect(() => {
    const onChangeUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const documentId = params.get("documentId")

      if (!documentId) {
        setSelectedGraphId(undefined)
        return
      }

      // add unknown graphIds to profile
      changeProfile((profile) => {
        if (
          !profile.graphIds.includes(documentId as DocumentId) &&
          (documentId as DocumentId) !== profile.settingsGraphId
        ) {
          profile.graphIds.push(documentId as DocumentId)
        }
      })

      setSelectedGraphId(documentId as DocumentId)
    }

    onChangeUrl()

    window.addEventListener("popstate", onChangeUrl)

    return () => {
      window.removeEventListener("popstate", onChangeUrl)
    }
  }, [])

  const onChangeSelectedGraphId = (graphId: DocumentId) => {
    const url = `${location.href.split("?")[0]}?documentId=${graphId}`
    history.pushState({}, "", url)
    window.dispatchEvent(new Event("popstate"))
  }

  const onAddNewDocument = () => {
    changeProfile((doc) => {
      const graphDocHandle = createGraphDoc(repo)

      changeProfile((profile) => {
        profile.graphIds.push(graphDocHandle.documentId)
        onChangeSelectedGraphId(graphDocHandle.documentId)
      })
    })
  }

  const onExport = async (asRaw: boolean) => {
    if (!selectedGraphId) {
      return
    }

    const handle = repo.find<GraphDoc>(selectedGraphId)
    const doc = await handle.value()
    const firstRootNodeId = doc.rootNodeIds[0]
    const node = getNode(doc.graph, firstRootNodeId)
    const filename = `${node.value.toLowerCase().replaceAll(" ", "_") ?? "untitled"}`

    if (asRaw) {
      downloadUint8Array(save(handle.doc), `${filename}.bin`)
    } else {
      downloadTextFile(`${filename}.json`, JSON.stringify(doc, null, 2))
    }
  }

  const onImport = async () => {
    const files = await fileDialog()

    const jsonObjects = await Promise.all(
      Array.from(files).map(async (file) => {
        const text = await file.text()

        try {
          return JSON.parse(text)
        } catch (err) {
          return undefined
        }
      })
    )

    let lastImportedDocId: DocumentId | undefined

    for (const jsonObject of jsonObjects) {
      // light validation
      if (
        jsonObject &&
        Array.isArray(jsonObject.rootNodeIds) &&
        typeof jsonObject.cache === "object" &&
        typeof jsonObject.graph === "object"
      ) {
        lastImportedDocId = importGraph(repo, profileDocId, jsonObject)
      }
    }

    if (lastImportedDocId) {
      onChangeSelectedGraphId(lastImportedDocId)
    }
  }

  if (!profile) {
    return null
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        graphIds={profile.graphIds}
        selectedGraphId={selectedGraphId}
        onChangeSelectedGraphId={onChangeSelectedGraphId}
        onAddNewDocument={onAddNewDocument}
        onOpenSettings={() => {
          onChangeSelectedGraphId(profile?.settingsGraphId)
        }}
        onExport={onExport}
        onImport={onImport}
      />

      <div className="p-4 bg-gray-50 flex w-full h-screen items-middle relative overflow-auto">
        {selectedGraphId && (
          <PathViewer graphId={selectedGraphId} settingsGraphId={profile.settingsGraphId} />
        )}
      </div>
    </div>
  )
}

interface SidebarProps {
  graphIds: DocumentId[]
  selectedGraphId: DocumentId | undefined
  onChangeSelectedGraphId: (graphId: DocumentId) => void
  onOpenSettings: () => void
  onAddNewDocument: () => void
  onExport: (asRaw: boolean) => void
  onImport: () => void
}

function Sidebar({
  graphIds,
  onAddNewDocument,
  selectedGraphId,
  onChangeSelectedGraphId,
  onOpenSettings,
  onExport,
  onImport,
}: SidebarProps) {
  const [showSidebar, setShowSidebar] = useState(true)

  if (!showSidebar) {
    return (
      <div className="px-1 py-4  bg-gray-100 border-r border-r-gray-200 flex flex flex-col">
        <div className="w-[24px] h-[24px]">
          <IconButton icon="menu" onClick={() => setShowSidebar(true)} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 w-[300px] bg-gray-100 border-r border-r-gray-200 flex-shrink-0 flex flex-col gap-2">
      <div className="flex justify-between pb-4">
        <Logo />

        <div className="flex gap-2">
          {selectedGraphId && (
            <div className="w-[24px] h-[24px]">
              <IconButton icon="download" onClick={(evt) => onExport(evt.metaKey)} />
            </div>
          )}
          <div className="w-[24px] h-[24px]">
            <IconButton icon="upload" onClick={() => onImport()} />
          </div>
          <div className="w-[24px] h-[24px]">
            <IconButton icon="settings" onClick={() => onOpenSettings()} />
          </div>

          <div className="w-[24px] h-[24px]">
            <IconButton icon="menu" onClick={() => setShowSidebar(false)} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {graphIds
          .filter((graphId) => graphId === selectedGraphId || !LOAD_SINGLE_DOC)
          .map((graphId, index) => {
            const isSelected = selectedGraphId === graphId

            return (
              <SidebarTab
                key={index}
                graphId={graphId}
                isSelected={isSelected}
                onSelect={() => {
                  onChangeSelectedGraphId(graphId)
                }}
              />
            )
          })}

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
    </div>
  )
}

interface SidebarTabProps {
  graphId: DocumentId
  isSelected: boolean
  onSelect: () => void
}

function SidebarTab({ graphId, isSelected, onSelect }: SidebarTabProps) {
  const [graphDoc] = useDocument<GraphDoc>(graphId)

  if (!graphDoc || !graphDoc.rootNodeIds || graphDoc.rootNodeIds.length === 0) {
    return null
  }

  const { graph, rootNodeIds } = graphDoc
  const displayedRootNodeIds = rootNodeIds.filter((rootNodeId) => graph[rootNodeId].type !== "ref")

  return (
    <div
      className={classNames("rounded-md p-1 flex gap-1 cursor-pointer", {
        "bg-white shadow": isSelected,
        "hover:bg-gray-200": !isSelected,
      })}
      onClick={() => onSelect()}
    >
      {displayedRootNodeIds.map((rootNodeId, rootNodeIndex) => {
        // filter out ref nodes
        if (graph[rootNodeId].type === "ref") {
          return null
        }

        const node = getNode(graph, rootNodeId)
        const label = node.value === "" ? "Untitled" : node.value

        return (
          <div
            key={rootNodeIndex}
            className={classNames(
              "p-1 rounded-md w-fit whitespace-nowrap overflow-ellipsis overflow-hidden flex",
              {
                "bg-gray-100": displayedRootNodeIds.length > 1 && isSelected,
              }
            )}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}

interface PathViewerProps {
  graphId: DocumentId
  settingsGraphId: DocumentId
}

export function PathViewer({ graphId, settingsGraphId }: PathViewerProps) {
  const repo = useRepo()
  const [doc, changeDoc] = useDocument<GraphDoc>(graphId)
  const [settingsDoc] = useDocument<GraphDoc>(settingsGraphId)
  const [selectedPath, setSelectedPath] = useState<number[] | undefined>(undefined)
  const [focusOffset, setFocusOffset] = useState<number>(0)
  const [isHoveringOverId, setIsHoveringOverId] = useState<string | undefined>(undefined)
  const [initializedGraphId, setInitializedGraphId] = useState<DocumentId | undefined>()
  const [temporaryMapObjects, setTemporaryMapObjects] = useState<TemporaryMapObjects | undefined>()
  const isSettingsPath = settingsGraphId === graphId

  const graphContext: GraphContextProps | undefined = useMemo(
    () =>
      doc && settingsDoc
        ? {
            graph: doc.graph,
            changeGraph: (fn: (graph: Graph) => void) => changeDoc((doc) => fn(doc.graph)),
            settingsNodeId: settingsDoc.rootNodeIds[0],
            settingsGraph: settingsDoc.graph,
            temporaryMapObjects,
            setTemporaryMapObjects,
          }
        : undefined,
    [doc?.graph, changeDoc]
  )

  useEffect(() => {
    setInitializedGraphId(undefined)

    const handle = repo.find<GraphDoc>(graphId)

    // hack: delete nodes with isTemporary = true
    // this is a workaround to reset isTemporary nodes if they are not properly removed
    handle.change((doc) => deleteTemporaryNodesInGraphDoc(doc))

    registerGraphHandle(handle).then(() => {
      setInitializedGraphId(handle.documentId)
    })
  }, [graphId])

  useEffect(() => {}, [])

  const onCloseRootNodeAt = (index: number) => {
    changeDoc((doc) => {
      doc.rootNodeIds.splice(index, 1)
    })
  }

  const onAddRootNodeAfter = (index: number) => {
    changeDoc((doc) => {
      const newRootNode = createValueNode(doc.graph, {
        value: "",
      })

      doc.rootNodeIds.splice(index + 1, 0, newRootNode.id)
      setSelectedPath([index + 1])
    })
  }

  const onOpenNodeInNewPane = (nodeId: string) => {
    changeDoc((doc) => {
      doc.rootNodeIds.push(nodeId)
      setSelectedPath([doc.rootNodeIds.length - 1])
    })
  }

  const firstRootNodeId = doc?.rootNodeIds[0]
  const firstRootNode: ValueNode | undefined =
    firstRootNodeId && graphContext ? getNode(graphContext.graph, firstRootNodeId) : undefined

  useEffect(() => {
    document.title =
      firstRootNode?.value && isString(firstRootNode?.value) ? firstRootNode.value : "Breadboard"
  }, [firstRootNode?.value])

  if (!graphContext || !doc || initializedGraphId !== graphId) {
    return null
  }

  const { rootNodeIds } = doc

  return (
    <GraphContext.Provider value={graphContext}>
      {rootNodeIds.map((rootId, index) => {
        const selectedSubPath =
          selectedPath && selectedPath[0] === index ? selectedPath.slice(1) : undefined

        let width: number =
          index === 0 && FIXED_WIDTH_FIRST_PANEL_ENABLED
            ? FIRST_PANEL_WIDTH
            : doc.graph[rootId].paneWidth || DEFAULT_PANEL_WIDTH

        return (
          <div key={index} className="flex">
            <div
              className="p-6 bg-white border border-gray-200 relative overflow-auto flex-none rounded-md"
              style={{ width: `${width}px` }}
            >
              {!isSettingsPath && SHOW_CLOSE_BUTTON && (
                <div className="absolute top-1 right-1 z-50">
                  <IconButton icon="close" onClick={() => onCloseRootNodeAt(index)} />
                </div>
              )}
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
                onOpenNodeInNewPane={onOpenNodeInNewPane}
                isHoveringOverId={isHoveringOverId}
                setIsHoveringOverId={setIsHoveringOverId}
              />
            </div>
            <div className="flex flex-col justify-center items-center gap-2 w-[30px]">
              {!isSettingsPath && (
                <IconButton icon="add" onClick={() => onAddRootNodeAfter(index)} />
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
    </GraphContext.Provider>
  )
}

// expects to be passed a mutable doc
function deleteTemporaryNodesInGraphDoc(doc: GraphDoc) {
  doc.rootNodeIds.forEach((nodeId) => {
    deleteTemporaryNodesInNode(doc.graph, nodeId)
  })
}

// expects to be passed a mutable graph
function deleteTemporaryNodesInNode(graph: Graph, nodeId: string) {
  const node = getNode(graph, nodeId)

  if (node.isTemporary) {
    // delete node from parents
    Object.values(graph).forEach((node) => {
      if (node.type === "value") {
        const index = node.children.indexOf(nodeId)

        if (index !== -1) {
          node.children.splice(index, 1)
        }
      }
    })

    // delete node
    delete graph[node.id]
  }

  node.children.forEach((childId) => deleteTemporaryNodesInNode(graph, childId))
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

type RootOutlineEditorProps = Omit<OutlineEditorProps, "scope">

export type PopOverValue =
  | { type: "node"; id: string }
  | { type: "computationResult"; name: string; value: any }

interface PopOverContextProps {
  onOpenPopOver: (x: number, y: number, value: PopOverValue) => void
}

export const PopOverContext = createContext<PopOverContextProps | undefined>(undefined)

export const useOpenPopOver = () => {
  const context = useContext(PopOverContext)
  if (!context) {
    throw new Error("missing popover context")
  }

  return context.onOpenPopOver
}

export function RootOutlineEditor(props: RootOutlineEditorProps) {
  const graphContext = useGraph()
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [activePopOver, setActivePopOver] = useState<
    { x: number; y: number; value: PopOverValue } | undefined
  >()

  // close tooltip on click outside
  useEffect(() => {
    const onClick = (evt: MouseEvent) => {
      setActivePopOver(undefined)
    }

    document.addEventListener("click", onClick)

    return () => {
      document.removeEventListener("click", onClick)
    }
  }, [])

  const onOpenPopOver = useStaticCallback((x: number, y: number, value: PopOverValue) => {
    const currentContainer = containerRef.current
    if (!currentContainer) {
      return
    }

    const containerRect = currentContainer.getBoundingClientRect()

    setActivePopOver({
      x: x - containerRect.x,
      y: y - containerRect.y + 20,
      value,
    })
  })

  const popOverContext = useMemo<PopOverContextProps>(() => {
    return {
      onOpenPopOver,
    }
  }, [])

  const { nodeId } = props
  const scope = useRootScope(nodeId)

  if (!scope) {
    return null
  }

  return (
    <PopOverContext.Provider value={popOverContext}>
      <div ref={containerRef}>
        <OutlineEditor scope={scope} {...props} />
        {activePopOver && (
          <div
            ref={tooltipRef}
            className="absolute pt-2"
            style={{
              top: `${activePopOver.y + 24}px`,
              left: `${activePopOver.x + 24}px`,
            }}
          >
            <div
              className="relative tooltip flex flex-col"
              onClick={(evt) => {
                evt.stopPropagation()
              }}
            >
              {activePopOver && activePopOver.value.type === "node" && (
                <PopoverOutlineView
                  rootId={activePopOver.value.id}
                  graphContext={graphContext}
                  onOpenNodeInNewPane={() => {
                    setActivePopOver(undefined)
                    props.onOpenNodeInNewPane((activePopOver.value as any).id)
                  }}
                />
              )}

              {activePopOver && activePopOver.value.type === "computationResult" && (
                <PopoverComputationResult
                  value={activePopOver.value.value}
                  name={activePopOver.value.name}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </PopOverContext.Provider>
  )
}

interface PopoverComputationResultProps {
  name?: string
  value: any
}

export function PopoverComputationResult({ value, name }: PopoverComputationResultProps) {
  const computationColor = "purple"

  const customView = name ? FUNCTIONS[name].expandedView : undefined

  if (customView) {
    return customView(value, computationColor)
  }

  return (
    <pre
      className={`bg-${computationColor}-200 text-${computationColor}-600 rounded p-1 overflow-auto`}
    >
      {safeJsonStringify(value)}
    </pre>
  )
}
