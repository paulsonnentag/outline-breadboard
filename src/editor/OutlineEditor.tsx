import {
  createRecordNode,
  createRefNode,
  createValueNode,
  getLabelOfNode,
  getNode,
  Graph,
  isNodeCollapsed,
  Node,
  RecordDef,
  useGraph,
} from "../graph"
import { DragEvent, MouseEvent, useCallback, useState } from "react"
import classNames from "classnames"
import { getIsHovering, isString, last } from "../utils"
import { NodeView, SummaryView } from "../views"
import { NodeContextMenu } from "./NodeContextMenu"
import { TextInput } from "./TextInput"
import { useStaticCallback } from "../hooks"
import { Scope } from "../language/scopes"
import { ComputationResultsSummaryView } from "../language/functions"
import { createParkingSpotNode, isParkingSpotId } from "../language/functions/parkingSpots"
import { SHOW_FUNCTION_SUGGESTIONS } from "../config"

export interface OutlineEditorProps {
  scope: Scope
  nodeId: string
  index: number
  parentIds: string[]
  isParentDragged?: boolean
  path: number[]
  selectedPath?: number[]
  focusOffset: number // this is kind of hacky, it's necessary so that when two bullets are joined through deletion the cursor is set to the right position
  onOpenNodeInNewPane: (nodeId: string) => void
  onChangeSelectedPath: (path: number[] | undefined, focusOffset?: number) => void
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
  disableCustomViews?: boolean
  showRootBullet?: boolean
}

const HIDE_VIEW_PROPERTY = false

export function OutlineEditor({
  nodeId,
  path,
  scope,
  index,
  parentIds,
  isParentDragged,
  selectedPath,
  focusOffset,
  onChangeSelectedPath,
  onOpenNodeInNewPane,
  isHoveringOverId,
  setIsHoveringOverId,
  disableCustomViews = false,
  showRootBullet = false,
}: OutlineEditorProps) {
  const { graph, changeGraph } = useGraph()
  const [isBeingDragged, setIsBeingDragged] = useState(false)
  const [isDraggedOver, setIsDraggedOver] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [computationSuggestionUpdate, setComputationSuggestionUpdate] = useState(0) // hack: allow context menu to trigger rerender by setting isComputationSuggestionHovered
  const node = getNode(graph, nodeId)

  const isFocused = (selectedPath && arePathsEqual(selectedPath, path)) ?? false
  const parentId = last(parentIds)
  const grandParentId = parentIds[parentIds.length - 2]
  const isRoot = parentId === undefined
  const isCollapsed = isNodeCollapsed(graph, nodeId) && !isRoot
  const isCollapsable = node.children.length > 0
  const isSelected = node.isSelected
  const isReferenceNode = node.id !== nodeId
  const isReferenceView = isReferenceNode && graph[nodeId].view !== undefined
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const onToggleIsCollapsed = useCallback(
    (evt: MouseEvent) => {
      changeGraph((graph) => {
        const node = graph[nodeId]
        const { isCollapsed } = node

        // close all children
        if (evt.metaKey) {
          const parent = getNode(graph, parentId)

          for (const childId of parent.children) {
            graph[childId].isCollapsed = !isCollapsed
          }
        } else {
          node.isCollapsed = !isCollapsed
        }
      })
    },
    [changeGraph]
  )

  const onSelectNode = (nodeId: string) => {
    changeGraph((graph) => {
      const node = getNode(graph, nodeId)
      node.isSelected = !node.isSelected
    })
  }

  const onRemoveView = () => {
    changeGraph((graph) => {
      delete graph[nodeId].view
    })
  }

  const onChange = useStaticCallback((value: string) => {
    // ignore change events from temporary nodes because they don't actually live in the graph
    if (node.isTemporary) {
      return
    }

    changeGraph((graph) => {
      const node = getNode(graph, nodeId)
      node.value = value
    })
  })

  const onFocus = useStaticCallback(() => {
    onChangeSelectedPath(path)
  })

  const onBlur = useStaticCallback(() => {
    onChangeSelectedPath(undefined)
  })

  const onJoinWithPrev = useStaticCallback(() => {
    if (node.children.length !== 0 || !parentId) {
      return
    }

    // if it's the first child join it with parent
    if (index === 0) {
      const parent = getNode(graph, parentId)

      // can't join with parent if parent is not text
      if (!isString(parent.value)) {
        return
      }

      changeGraph((graph) => {
        const parent = getNode(graph, parentId)
        delete parent.children[index]
        const focusOffset = (parent.value as string).length
        ;(parent.value as string) += node.value as string
        onChangeSelectedPath(path.slice(0, -1), focusOffset)
      })

      // ... otherwise join it with the last child of the previous sibling
    } else {
      const parent = getNode(graph, parentId)
      const prevSibling = getNode(graph, parent.children[index - 1])

      const lastChildPath = prevSibling.isCollapsed ? [] : getLastChildPath(graph, prevSibling.id)
      const prevNode = getNodeAt(graph, prevSibling.id, lastChildPath)

      if (!prevNode) {
        throw new Error("invalid state")
      }

      const prevNodeId = prevNode.id
      changeGraph((graph) => {
        const parent = getNode(graph, parentId)
        const prevNode = getNode(graph, prevNodeId)

        delete parent.children[index]
        const focusOffset = (prevNode.value as string).length
        ;(prevNode.value as string) += node.value as string

        onChangeSelectedPath(path.slice(0, -1).concat(index - 1, lastChildPath), focusOffset)
      })
    }
  })

  const onSplit = useStaticCallback((splitIndex: number) => {
    changeGraph((graph) => {
      const node = getNode(graph, nodeId)

      const newNode = createValueNode(graph, {
        value: (node.value as string).slice(splitIndex),
      })

      node.value = (node.value as string).slice(0, splitIndex)

      if ((node.children.length === 0 || node.isCollapsed || splitIndex === 0) && parentId) {
        const parent = getNode(graph, parentId)
        parent.children.splice(index + 1, 0, newNode.id)
        onChangeSelectedPath(path.slice(0, -1).concat(index + 1))

        // copy children over to new node
        if (!node.isCollapsed || splitIndex == 0) {
          newNode.children = []
          for (const childId of node.children) {
            newNode.children.push(childId)
          }

          if (node.isCollapsed) {
            node.isCollapsed = false
            newNode.isCollapsed = true
          }

          node.children = []
        }
      } else {
        node.children.unshift(newNode.id)
        onChangeSelectedPath(path.concat(0))
      }
    })
  })

  const onIndent = useStaticCallback(() => {
    // can't indent root or nodes that are already indented to the max
    if (index == 0 || parentId === undefined) {
      return
    }

    changeGraph((graph) => {
      const parent = getNode(graph, parentId)
      const prevSibling = getNode(graph, parent.children[index - 1])

      const newIndex = prevSibling.children.length

      delete parent.children[index]
      prevSibling.children[newIndex] = nodeId

      onChangeSelectedPath(path.slice(0, -1).concat(index - 1, newIndex))
    })
  })

  const onOutdent = useStaticCallback(() => {
    // can't outndent root or top level node
    if (!parentId || !grandParentId) {
      return
    }

    changeGraph((graph) => {
      const parent = getNode(graph, parentId)
      const parentIndex = path[path.length - 2]
      const grandParent = getNode(graph, grandParentId)

      delete parent.children[index]
      const newIndex = parentIndex + 1
      grandParent.children.splice(newIndex, 0, nodeId)
      onChangeSelectedPath(path.slice(0, -2).concat(newIndex))
    })
  })

  const onFocusDown = useStaticCallback(() => {
    if (node.children.length > 0 && !isCollapsed) {
      onChangeSelectedPath(path.concat(0))
      return
    }

    const nextPath = getNextPath(graph, path, node, parentIds)

    if (nextPath) {
      onChangeSelectedPath(nextPath)
    }
  })

  const onFocusUp = useStaticCallback(() => {
    // can't go up if node has no parent
    if (!parentId) {
      return
    }

    // if first child go up to parent
    if (index === 0) {
      onChangeSelectedPath(path.slice(0, -1))
      return
    }

    const parent = getNode(graph, parentId)
    const prevSiblingId = parent.children[index - 1]

    // if previous sibling is collapsed pick it directly
    if (isNodeCollapsed(graph, prevSiblingId)) {
      onChangeSelectedPath(path.slice(0, -1).concat(index - 1))
      return
    }

    // ... otherwise pick last child of previous sibling
    onChangeSelectedPath(
      getLastChildPath(graph, prevSiblingId, path.slice(0, -1).concat(index - 1))
    )
  })

  const onDragStart = (evt: DragEvent) => {
    evt.stopPropagation()
    var elem = document.createElement("div")
    elem.style.position = "absolute"
    elem.className = "bg-white border border-gray-200 px-2 py-1 rounded flex gap-2"
    elem.style.top = "-1000px"
    elem.innerText = getLabelOfNode(node)
    document.body.appendChild(elem)

    setTimeout(() => {
      elem.remove()
    })

    evt.dataTransfer.effectAllowed = "move"
    evt.dataTransfer.setDragImage(elem, -10, -10)
    evt.dataTransfer.setData(
      "application/node",
      isRoot
        ? JSON.stringify({
            type: "create",
            nodeId,
          })
        : JSON.stringify({ type: "move", id: nodeId, parentId, index })
    )
    setIsBeingDragged(true)
  }

  const onDragEnd = () => {
    setIsBeingDragged(false)
  }

  const onDragOver = (evt: DragEvent) => {
    if (isBeingDragged || isParentDragged) {
      return
    }
    setIsDraggedOver(true)

    evt.preventDefault()
    evt.stopPropagation()
  }

  const onDragEnter = (evt: DragEvent) => {
    if (isBeingDragged || isParentDragged) {
      return
    }
    evt.preventDefault()
    evt.stopPropagation()
  }

  const onDragLeave = () => {
    setIsDraggedOver(false)
  }

  const onDrop = async (evt: DragEvent) => {
    evt.stopPropagation()

    setIsDraggedOver(false)

    if (evt.dataTransfer.files.length > 0) {
      evt.preventDefault()

      const file = evt.dataTransfer.files[0]

      const fileReader = new FileReader()

      fileReader.onerror = (err) => {
        console.log("onerror", err)
      }
      fileReader.onload = (value) => {
        try {
          const recordDefs: RecordDef[] = JSON.parse(fileReader.result as string)

          changeGraph((graph) => {
            const node = getNode(graph, nodeId)

            for (const recordDef of recordDefs) {
              const childNode = createRecordNode(graph, recordDef)
              node.children.push(childNode.id)
            }
          })
        } catch (err) {
          console.error("could not read file")
        }

        console.log(fileReader.result)
      }

      console.log("read file")

      fileReader.readAsText(file)

      return
    }

    const dragData = JSON.parse(evt.dataTransfer.getData("application/node"))

    switch (dragData.type) {
      case "move": {
        const { id: sourceId, parentId: sourceParentId, index: sourceIndex } = dragData

        const isLinkModeEnabled = evt.shiftKey

        changeGraph((graph) => {
          const node = getNode(graph, nodeId)

          let nodeIdToInsert: string = sourceId

          if (!isLinkModeEnabled) {
            const sourceParent = getNode(graph, sourceParentId)
            delete sourceParent.children[sourceIndex]
          } else {
            nodeIdToInsert = createRefNode(graph, sourceId).id
          }

          if ((node.children.length !== 0 || !parentId) && !isCollapsed) {
            // important to get node from mutable graph
            node.children.unshift(nodeIdToInsert)
          } else {
            const insertIndex =
              ((parentId === sourceParentId && sourceIndex) || isLinkModeEnabled) < index
                ? index
                : index + 1

            const parent = getNode(graph, parentId)
            parent.children.splice(insertIndex, 0, nodeIdToInsert)
          }
        })
        break
      }

      case "create": {
        if (isParkingSpotId(dragData.nodeId) && !graph[dragData.nodeId]) {
          await createParkingSpotNode(changeGraph, dragData.nodeId)
        }

        changeGraph((graph) => {
          const node = getNode(graph, nodeId)
          const nodeIdToInsert = createValueNode(graph, { value: `#[${dragData.nodeId}]` }).id

          if ((node.children.length !== 0 || !parentId) && !isCollapsed) {
            // important to get node from mutable graph
            node.children.unshift(nodeIdToInsert)
          } else {
            const parent = getNode(graph, parentId)
            parent.children.splice(index + 1, 0, nodeIdToInsert)
          }
        })
      }
    }
  }

  const color = scope.getProperty("color") ?? scope.lookupValue("color")

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={classNames(
        {
          "text-gray-300": isBeingDragged || isParentDragged,
        },
        "mr-2" // room for the NodeContextMenu
      )}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isReferenceView ? (
        <>
          <NodeView
            refNodeId={nodeId}
            scope={scope}
            node={{ ...node, view: graph[nodeId].view }}
            isFocused={isFocused}
            fullpane={true}
            onOpenNodeInNewPane={onOpenNodeInNewPane}
            isHoveringOverId={isHoveringOverId}
            setIsHoveringOverId={setIsHoveringOverId}
          />
        </>
      ) : (
        <>
          <div
            className={classNames(
              "flex items-start w-full",
              isRoot ? "mt-[6px]" : "mt-[1px] ml-[-10px]",
              {
                "opacity-50": node.isTemporary,
              }
            )}
            onClick={() => {
              onChangeSelectedPath(path)
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {!isRoot && (
              <div
                className={classNames("material-icons cursor-pointer text-gray-500", {
                  invisible: (!isHovered && !isCollapsed) || !isCollapsable,
                })}
                style={{
                  transform: isCollapsed ? "" : "rotate(90deg)",
                }}
                onClick={onToggleIsCollapsed}
              >
                chevron_right
              </div>
            )}

            {(!isRoot || showRootBullet) && (
              <div
                className={classNames("bullet", {
                  "is-transcluded": isReferenceNode,
                  "is-collapsed": isCollapsed,
                  invisible:
                    !isFocused &&
                    node.value == "" &&
                    node.key === undefined &&
                    node.view === undefined &&
                    node.children.length === 0,
                  "pt-3 pl-2": showRootBullet && isRoot,
                })}
                onClick={(evt) => {
                  evt.stopPropagation()
                  if (evt.metaKey) {
                    onOpenNodeInNewPane(node.id)
                  } else {
                    onSelectNode(node.id)
                  }
                }}
              />
            )}
            <div
              className={classNames("pr-2 flex-1 rounded box-border border-l-2 border-white", {
                // "pl-2": isFocused || node.value !== "" || node.key !== undefined,
                "bg-blue-50 border-blue-400":
                  getIsHovering(graph, node.id, parentIds, isHoveringOverId) &&
                  !(isBeingDragged || isParentDragged),
                "bg-blue-100 border-blue-400": isSelected && !(isBeingDragged || isParentDragged),
              })}
              onMouseEnter={() => setIsHoveringOverId(node.id)}
              onMouseLeave={() => isHoveringOverId == node.id && setIsHoveringOverId(undefined)}
            >
              <TextInput
                parentIds={parentIds}
                isRoot={isRoot}
                nodeId={node.id}
                value={node.value as string}
                scope={scope}
                isFocused={isFocused}
                focusOffset={focusOffset}
                onChange={onChange}
                onFocusUp={onFocusUp}
                onFocusDown={onFocusDown}
                onSplit={onSplit}
                onJoinWithPrev={onJoinWithPrev}
                onFocus={onFocus}
                onBlur={onBlur}
                onIndent={onIndent}
                onOutdent={onOutdent}
                isHoveringOverId={isHoveringOverId}
                setIsHoveringOverId={setIsHoveringOverId}
                onChangeIsMenuOpen={setIsMenuOpen}
              />
              <ComputationResultsSummaryView scope={scope} />
            </div>
            {!disableCustomViews && SHOW_FUNCTION_SUGGESTIONS && isFocused && (
              <NodeContextMenu
                hideFunctionButtons={isMenuOpen}
                computationSuggestionUpdated={() =>
                  setComputationSuggestionUpdate(computationSuggestionUpdate + 1)
                }
                node={node}
                scope={scope}
                isFocusedOnNode={isFocused}
                isAnotherFocused={selectedPath !== undefined && !isFocused}
                isHoveredOnNode={isHovered}
                onOpenNodeInNewPane={onOpenNodeInNewPane}
              />
            )}
          </div>

          <div className="pl-10">
            <NodeView
              scope={scope}
              node={node}
              isFocused={isFocused}
              fullpane={false}
              onOpenNodeInNewPane={onOpenNodeInNewPane}
              isHoveringOverId={isHoveringOverId}
              setIsHoveringOverId={setIsHoveringOverId}
            />
          </div>

          {node.isCollapsed && (
            <div className="pl-10">
              <SummaryView scope={scope} />
            </div>
          )}

          <div
            className={classNames(
              "w-full border-b-2",
              {
                "ml-4": node.children.length,
              },
              isDraggedOver ? "border-blue-500" : "border-white"
            )}
          />

          {!isCollapsed && (
            <div
              className={classNames("w-full", {
                "pl-4": !isRoot || showRootBullet,
              })}
            >
              {scope.childScopes.map((childScope, index) =>
                scope && (!childScope.source.startsWith("view:") || !HIDE_VIEW_PROPERTY) ? (
                  <OutlineEditor
                    scope={childScope}
                    isParentDragged={isBeingDragged}
                    key={index}
                    nodeId={childScope.id}
                    index={index}
                    parentIds={parentIds.concat(node.id)}
                    path={path.concat(index)}
                    selectedPath={selectedPath}
                    focusOffset={focusOffset}
                    onChangeSelectedPath={onChangeSelectedPath}
                    onOpenNodeInNewPane={onOpenNodeInNewPane}
                    isHoveringOverId={isHoveringOverId}
                    setIsHoveringOverId={setIsHoveringOverId}
                    disableCustomViews={disableCustomViews}
                  />
                ) : null
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface BulletViewProps {
  scope: Scope
  isHoveringOverId: string | undefined
}

function arePathsEqual(path1: number[], path2: number[]) {
  if (path1.length !== path2.length) {
    return false
  }

  for (let i = 0; i < path1.length; i++) {
    if (path1[i] !== path2[i]) {
      return false
    }
  }

  return true
}

function getLastChildPath(graph: Graph, nodeId: string, prefixPath: number[] = []): number[] {
  const node = getNode(graph, nodeId)

  const lastIndex = node.children.length - 1

  if (lastIndex === -1) {
    return prefixPath
  }

  const lastChild = node.children[lastIndex]
  return getLastChildPath(graph, lastChild, prefixPath.concat(lastIndex))
}

function getNodeAt(graph: Graph, nodeId: string, path: number[]): Node | undefined {
  let currentNode = getNode(graph, nodeId)

  for (const index of path) {
    const childId = currentNode.children[index]

    if (!childId) {
      return undefined
    }

    currentNode = getNode(graph, childId)
  }

  return currentNode
}

function getNextPath(
  graph: Graph,
  selectedPath: number[],
  node: Node,
  parentIds: string[]
): number[] | undefined {
  const parentId = last(parentIds)

  if (!parentId) {
    return undefined
  }

  const parent = getNode(graph, parentId)
  const index = last(selectedPath)

  if (index + 1 < parent.children.length) {
    return selectedPath.slice(0, -1).concat(index + 1)
  }

  return getNextPath(graph, selectedPath.slice(0, -1), parent, parentIds.slice(0, -1))
}
