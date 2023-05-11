import { DocumentId } from "automerge-repo"
import { MouseEventHandler, useEffect, useMemo, useState } from "react"
import {
  createGraphDoc,
  createValueNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  GraphDoc,
  registerGraphHandle,
  ValueNode,
} from "./graph"

import { OutlineEditor, OutlineEditorProps } from "./editor/OutlineEditor"
import { IconButton } from "./IconButton"
import classNames from "classnames"
import { isString } from "./utils"
import { useRootScope } from "./language/scopes"
import { useDocument, useHandle, useRepo } from "automerge-repo-react-hooks"
import { ProfileDoc } from "./profile"

interface RootProps {
  profileDocId: DocumentId
}

const DEFAULT_WIDTH = 800

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
        if (!profile.graphIds.includes(documentId as DocumentId)) {
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
        setSelectedGraphId(graphDocHandle.documentId)
      })
    })
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
}

function Sidebar({
  graphIds,
  onAddNewDocument,
  selectedGraphId,
  onChangeSelectedGraphId,
  onOpenSettings,
}: SidebarProps) {
  return (
    <div className="p-4 w-[300px] bg-gray-100 border-r border-r-gray-200 flex-shrink-0 flex flex-col gap-2">
      <div className="flex justify-between">
        <div className="text-xl">Breadboard</div>

        <div className="w-[24px] h-[24px]">
          <IconButton icon="settings" onClick={() => onOpenSettings()} />
        </div>
      </div>

      <div className="flex-col gap-1">
        {graphIds.map((graphId, index) => {
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

  return (
    <div
      className={classNames("rounded-md p-1 flex gap-1 cursor-pointer", {
        "bg-white shadow": isSelected,
        "hover:bg-gray-200": !isSelected,
      })}
      onClick={() => onSelect()}
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
  const isSettingsPath = settingsGraphId === graphId

  const graphContext: GraphContextProps | undefined = useMemo(
    () =>
      doc && settingsDoc
        ? {
            graph: doc.graph,
            changeGraph: (fn: (graph: Graph) => void) => changeDoc((doc) => fn(doc.graph)),
            settingsNodeId: settingsDoc.rootNodeIds[0],
            settingsGraph: settingsDoc.graph,
          }
        : undefined,
    [doc?.graph, changeDoc]
  )

  useEffect(() => {
    setInitializedGraphId(undefined)

    const handle = repo.find<GraphDoc>(graphId)
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

        let width: number = doc.graph[rootId].paneWidth || DEFAULT_WIDTH

        return (
          <div key={index} className="flex">
            <div
              className="p-6 bg-white border border-gray-200 relative overflow-auto flex-none rounded-md"
              style={{ width: `${width}px` }}
            >
              {!isSettingsPath && (
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

export function RootOutlineEditor(props: RootOutlineEditorProps) {
  const { nodeId } = props
  const scope = useRootScope(nodeId)

  if (!scope) {
    return null
  }

  return <OutlineEditor scope={scope} {...props} />
}
