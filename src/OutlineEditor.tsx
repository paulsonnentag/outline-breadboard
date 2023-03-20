import {
  createRecordNode,
  createRefNode,
  createValueNode,
  getNode,
  Graph,
  ImageValue,
  isNodeCollapsed,
  Node,
  NodeValue,
  RecordDef,
  useGraph,
  ValueNode,
} from "./graph"
import {
  DragEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import classNames from "classnames"
import { getCaretCharacterOffset, isString, last, setCaretCharacterOffset } from "./utils"
import { NodeView } from "./views"
import { TextNodeValueView } from "./TextNodeValueView"
import { isArrowDown, isArrowUp, isBackspace, isEnter, isTab } from "./keyboardEvents"

interface OutlineEditorProps {
  nodeId: string
  index: number
  parentIds: string[]
  isParentDragged?: boolean
  path: number[]
  selectedPath?: number[]
  focusOffset: number // this is kind of hacky, it's necessary so that when two bullets are joined through deletion the cursor is set to the right position
  onOpenNodeInNewPane: (nodeId: string) => void
  onChangeSelectedPath: (path: number[] | undefined, focusOffset?: number) => void
  onReplaceNode: (newNodeId: string) => void
}

export function OutlineEditor({
  nodeId,
  path,
  index,
  parentIds,
  isParentDragged,
  selectedPath,
  focusOffset,
  onChangeSelectedPath,
  onOpenNodeInNewPane,
  onReplaceNode,
}: OutlineEditorProps) {
  const { graph, changeGraph, setIsDragging } = useGraph()
  const [isBeingDragged, setIsBeingDragged] = useState(false)
  const [isDraggedOver, setIsDraggedOver] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const node = getNode(graph, nodeId)
  const isFocused = (selectedPath && arePathsEqual(selectedPath, path)) ?? false
  const parentId = last(parentIds)
  const grandParentId = parentIds[parentIds.length - 2]
  const isRoot = parentId === undefined
  const isCollapsed = isNodeCollapsed(graph, nodeId) && !isRoot
  const isCollapsable = node.children.length > 0
  const isReferenceNode = node.id !== nodeId

  const onChange = useCallback(
    (value: NodeValue) => {
      changeGraph((graph) => {
        const node = getNode(graph, nodeId)
        node.value = value
      })
    },
    [changeGraph]
  )

  const onReplaceChildNodeAt = (index: number, newNodeId: string) => {
    changeGraph((graph) => {
      const node = getNode(graph, nodeId)
      node.children[index] = newNodeId
    })
  }

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

  const onFocus = useCallback(
    (evt: FocusEvent) => {
      evt.stopPropagation()

      onChangeSelectedPath(path)
    },
    [onChangeSelectedPath]
  )

  const onRemoveView = () => {
    changeGraph((graph) => {
      delete graph[nodeId].view
    })
  }

  const onKeyDown = (evt: ReactKeyboardEvent) => {
    if (isBackspace(evt)) {
      if (!contentRef.current || getCaretCharacterOffset(contentRef.current) !== 0) {
        return
      }

      evt.preventDefault()
      evt.stopPropagation()

      if (node.children.length !== 0 || !parentId) {
        return
      }

      // delete key first if element has key
      if (node.key) {
        changeGraph((graph) => {
          const node = getNode(graph, nodeId)
          delete node.key
        })
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

        const lastChildPath = getLastChildPath(graph, prevSibling.id)
        const prevNode = getNodeAt(graph, prevSibling.id, lastChildPath)

        if (!prevNode) {
          throw new Error("invalid state")
        }

        // can't join with prevNode if prevNode is not text
        if (!isString(prevNode?.value)) {
          return
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
    } else if (isEnter(evt)) {
      {
        evt.preventDefault()
        evt.stopPropagation()

        const contentElement = contentRef.current

        if (!contentElement) {
          return
        }

        if (!isString(node.value)) {
          return
        }

        changeGraph((graph) => {
          const node = getNode(graph, nodeId)
          const caretOffset = getCaretCharacterOffset(contentElement)

          const newNode = createValueNode(graph, {
            value: (node.value as string).slice(caretOffset),
          })

          node.value = (node.value as string).slice(0, caretOffset)

          if (node.children.length === 0 && parentId) {
            const parent = getNode(graph, parentId)
            parent.children.splice(index + 1, 0, newNode.id)
            onChangeSelectedPath(path.slice(0, -1).concat(index + 1))
          } else {
            if (parentId) {
              const parent = getNode(graph, parentId)

              if (caretOffset === 0) {
                node.value = newNode.value
                newNode.value = ""

                parent.children.splice(index, 0, newNode.id)
              } else {
                parent.children.splice(index + 1, 0, newNode.id)
              }

              onChangeSelectedPath(path.slice(0, -2).concat(index + 1))
            } else {
              node.children.unshift(newNode.id)
              onChangeSelectedPath(path.concat(0))
            }
          }
        })
      }
    } else if (isTab(evt)) {
      evt.preventDefault()
      evt.stopPropagation()

      // unindent
      if (evt.shiftKey) {
        // can't unindent root or top level node
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
      } else {
        // indent

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
      }
    } else if (isArrowDown(evt)) {
      if (!selectedPath) {
        return
      }

      if (node.children.length > 0 && !isCollapsed) {
        onChangeSelectedPath(path.concat(0))
        return
      }

      const nextPath = getNextPath(graph, selectedPath, node, parentIds)

      if (nextPath) {
        onChangeSelectedPath(nextPath)
      }

      evt.preventDefault()
      evt.stopPropagation()
    } else if (isArrowUp(evt)) {
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

      evt.stopPropagation()
      evt.preventDefault()
    }
  }

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
    evt.dataTransfer.setData("application/node", JSON.stringify({ id: nodeId, parentId, index }))
    setIsBeingDragged(true)
    setIsDragging(true)
  }

  const onDragEnd = () => {
    setIsBeingDragged(false)
    setIsDragging(false)
  }

  const onDragOver = (evt: DragEvent) => {
    if (isBeingDragged || isParentDragged || !contentRef.current) {
      return
    }

    const percentage =
      (evt.clientY - contentRef.current.getBoundingClientRect().top) /
      contentRef.current.clientHeight

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

  const onDrop = (evt: DragEvent) => {
    setIsDraggedOver(false)

    if (evt.dataTransfer.files.length > 0) {
      evt.preventDefault()

      const file = evt.dataTransfer.files[0]

      const fileReader = new FileReader()

      fileReader.onerror = (err) => {
        console.log("onerror", err)
      }
      fileReader.onload = (value) => {
        console.log("onload")

        try {
          const recordDefs: RecordDef[] = JSON.parse(fileReader.result as string)

          console.log("add records", recordDefs.length)

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

    const {
      id: sourceId,
      parentId: sourceParentId,
      index: sourceIndex,
    } = JSON.parse(evt.dataTransfer.getData("application/node"))

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

      if (node.children.length !== 0 || !parentId) {
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
  }

  // focus contenteditable

  useEffect(() => {
    if (contentRef.current && isFocused && document.activeElement !== contentRef.current) {
      contentRef.current.focus()
      setCaretCharacterOffset(contentRef.current, focusOffset)
    }
  }, [isFocused])

  if (!node) {
    return <div className="text-red-500"> •️ Invalid node id {JSON.stringify(nodeId)}</div>
  }

  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div
        className={classNames({
          "text-gray-300": isBeingDragged || isParentDragged,
        })}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        <div className="w-full flex cursor-text items-center">
          <div
            className={classNames("flex items-start w-full", {
              "text-xl": isRoot,
            })}
            onClick={() => {
              onChangeSelectedPath(path)
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className={classNames("flex items-center", isRoot ? "mt-[6px]" : "mt-[1px]")}>
              {!isRoot && (
                <div
                  className={classNames("material-icons cursor-pointer text-gray-500", {
                    invisible: !isHovered || !isCollapsable,
                  })}
                  style={{
                    transform: isCollapsed ? "" : "rotate(90deg)",
                  }}
                  onClick={onToggleIsCollapsed}
                >
                  chevron_right
                </div>
              )}

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
                })}
                onClick={(evt) => {
                  evt.stopPropagation()
                  onOpenNodeInNewPane(node.id)
                }}
              />
            </div>
            <div
              className={classNames("pr-2 w-fit", {
                "pl-2": isFocused || node.value !== "" || node.key !== undefined,
              })}
            >
              <NodeValueView
                id={node.id}
                value={node.value}
                innerRef={contentRef}
                onChange={onChange}
                isFocused={isFocused}
                onReplaceNode={onReplaceNode}
                onBlur={() => {
                  onChangeSelectedPath(undefined)
                }}
              />
            </div>

            {node.view !== undefined && (
              <div className="rounded-sm bg-purple-200 text-purple-600 text-xs px-1 py-0.5 flex items-middle self-center mr-1">
                <div>
                  view: <span className="font-bold">{node.view}</span>
                </div>
                <button
                  className="material-icons"
                  style={{ fontSize: "16px" }}
                  onClick={onRemoveView}
                >
                  close
                </button>
              </div>
            )}

            {node.computations?.map((computation) => (
              <div
                key={computation}
                className="rounded-sm bg-blue-200 text-blue-600 font-bold text-xs px-1 py-0.5 flex items-middle self-center mr-1"
              >
                <div>{computation}</div>
                <button
                  className="material-icons"
                  style={{ fontSize: "16px" }}
                  onClick={() =>
                    changeGraph((graph) => {
                      const node = getNode(graph, nodeId)
                      node.computations = node.computations?.filter((c) => c != computation)
                      if (isString(node.value) && node.value.length === 0) {
                        node.value = computation
                          .split("-")
                          .map((t) => t[0].toUpperCase() + t.substring(1))
                          .join(" ")
                      }
                    })
                  }
                >
                  close
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="pl-6">
          <NodeView node={node} isFocused={isFocused} onOpenNodeInNewPane={onOpenNodeInNewPane} />
        </div>
      </div>

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
            "pl-4": !isRoot,
          })}
        >
          {node.children.map((childId, index) => (
            <OutlineEditor
              isParentDragged={isBeingDragged}
              key={index}
              nodeId={childId}
              index={index}
              parentIds={parentIds.concat(node.id)}
              path={path.concat(index)}
              selectedPath={selectedPath}
              focusOffset={focusOffset}
              onChangeSelectedPath={onChangeSelectedPath}
              onOpenNodeInNewPane={onOpenNodeInNewPane}
              onReplaceNode={(newNodeId) => onReplaceChildNodeAt(index, newNodeId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export interface NodeValueViewProps {
  value: NodeValue
  id: string
  innerRef: RefObject<HTMLElement>
  onChange: (value: NodeValue) => void
  isFocused: boolean
  onBlur: () => void
  onReplaceNode: (newNodeId: string) => void
}

function NodeValueView(props: NodeValueViewProps) {
  const { value } = props

  if (isString(value)) {
    return <TextNodeValueView {...props} value={value} />
  }

  switch (value.type) {
    case "image":
      return <ImageNodeValueView {...props} value={value} />
  }

  return null
}

function getLabelOfNode(node: ValueNode<NodeValue>): string {
  if (isString(node.value)) {
    return node.value
  }

  return node.value.type
}

interface ImageNodeValueView extends NodeValueViewProps {
  value: ImageValue
}

function ImageNodeValueView({ value, innerRef }: ImageNodeValueView) {
  return <img alt="" className="w-full max-h-[300px]" src={value.url} />
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
