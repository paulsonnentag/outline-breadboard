import {
  createNode,
  createRefNode,
  getNode,
  Graph,
  isNodeCollapsed,
  isReferenceNodeId,
  Node,
  useGraph,
  ValueNode,
} from "./graph"
import {
  DragEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import classNames from "classnames"
import { last } from "./utils"
import ContentEditable from "react-contenteditable"
import { NodeView } from "./views"
import { InputProperty } from "./views/MapNodeView"

interface OutlineEditorProps {
  nodeId: string
  index: number
  parentIds: string[]
  isParentDragged?: boolean
  path: number[]
  selectedPath?: number[]
  onOpenNodeInNewPane: (nodeId: string) => void
  onChangeSelectedPath: (path: number[] | undefined) => void
}

export function OutlineEditor({
  nodeId,
  path,
  index,
  parentIds,
  isParentDragged,
  selectedPath,
  onChangeSelectedPath,
  onOpenNodeInNewPane,
}: OutlineEditorProps) {
  const { graph, changeGraph, setIsDragging } = useGraph()
  const [isBeingDragged, setIsBeingDragged] = useState(false)
  const [isDraggedOver, setIsDraggedOver] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0)
  const contentRef = useRef<HTMLElement>(null)
  const node = getNode(graph, nodeId)
  const isFocused = (selectedPath && arePathsEqual(selectedPath, path)) ?? false
  const parentId = last(parentIds)
  const grandParentId = parentIds[parentIds.length - 2]
  const isRoot = parentId === undefined
  const isReferenceNode = isReferenceNodeId(graph, nodeId)
  const isCollapsed = isNodeCollapsed(graph, nodeId) && !isRoot
  const isCollapsable = node.children.length > 0

  const commandQuery =
    isFocused &&
    node.value
      .split(" ")
      .reverse()
      .find((token) => token.startsWith("/"))
      ?.slice(1)

  // Future: A schema for commands. Until we know its shape in more cases, hardcoding.
  interface Command {
    title: string
    subtitle?: string
    action: () => void
    tabAction?: () => void
  }

  let commands: Command[] = [
    {
      title: "Use map view",
      action: () => {
        changeGraph((graph) => {
          const node = getNode(graph, nodeId)

          // This logic should be elsewhere; starting here until we can see a clear protocol
          // It should also be made generic; action could simply state expected inputs

          const indexOfInput = InputProperty.getChildIndexesOfNode(graph, nodeId)[0]

          if (indexOfInput === undefined) {
            const input = createNode(graph, { value: "input:" })

            input.children.push(
              createNode(graph, {
                value: "position: 37.2296, -80.4139",
              }).id
            )

            node.children.push(input.id)
          }

          node.view = "map"
          node.value = node.value
            .split(" ")
            .filter((token) => !token.startsWith("/"))
            .join(" ")
        })
      },
    },
    {
      title: "Use table view",
      action: () => {
        changeGraph((graph) => {
          const node = getNode(graph, nodeId)

          node.view = "table"
          node.value = node.value
            .split(" ")
            .filter((token) => !token.startsWith("/"))
            .join(" ")
        })
      },
    },
    {
      title: "Insert weather averages",
      action: () => {
        changeGraph((graph) => {
          const node = getNode(graph, nodeId)

          node.computations = (node.computations ?? []).concat(["weather-averages"])
          node.value = node.value
            .split(" ")
            .filter((token) => !token.startsWith("/"))
            .join(" ")

          const indexOfInput = InputProperty.getChildIndexesOfNode(graph, nodeId)[0]

          if (indexOfInput === undefined) {
            const input = createNode(graph, { value: "input:" })

            input.children.push(
              createNode(graph, {
                value: "position: 37.2296, -80.4139",
              }).id
            )

            node.children.push(input.id)
          }
        })
      },
    },
    {
      title: "Search for points of interest",
      subtitle: "",
      action: () => {},
      tabAction: () => {
        changeGraph((graph) => {
          const node = getNode(graph, nodeId)

          let tokens = node.value.split(" ")
          tokens[tokens.length - 1] = "/poi"

          node.value = tokens.join(" ") + " " // TODO: space is getting trimmed
        })
      },
    },
  ].filter((c) =>
    commandQuery ? c.title.toLowerCase().includes(commandQuery.toLowerCase()) : true
  )

  // this is not how this should work - just doing this for now
  //  in the future, we should come up w/ a way for searches to be run
  //  in-document or in the command menu with just one primitive
  const tokens = node.value.split(" ")
  const poiIndex = tokens.indexOf("/poi")

  if (poiIndex >= 0) {
    const query = tokens.slice(poiIndex + 1).join(" ")

    // Run the search with query

    let set: Command[] = [
      {
        title: "Gros Ventre Campground",
        subtitle: "100 Gros Ventre Campground Rd, Kelly, WY 83011",
        action: () => {
          changeGraph((graph) => {
            const node = getNode(graph, nodeId)

            node.value = "Gros Ventre Campground"

            const input = createNode(graph, { value: "input:" })

            input.children.push(
              createNode(graph, {
                value: "position: 43.6163222, -110.6668727",
              }).id
            )

            node.children.push(input.id)
          })
        },
      },
      {
        title: "Headwaters Campground and RV Park",
        subtitle: "101 Grassy Lake Road, Moran, WY 83013",
        action: () => {
          changeGraph((graph) => {
            const node = getNode(graph, nodeId)

            node.value = "Headwaters Campground and RV Park"

            const input = createNode(graph, { value: "input:" })

            input.children.push(
              createNode(graph, {
                value: "position: 44.10406650, -110.67592620",
              }).id
            )

            node.children.push(input.id)
          })
        },
      },
    ]

    commands = commands.concat(
      set.filter((c) => (query ? c.title.toLowerCase().includes(query.toLowerCase()) : false))
    )
  }

  const commandSelection = Math.min(selectedMenuIndex, commands.length - 1)

  const onChange = useCallback(() => {
    const currentContent = contentRef.current

    if (!currentContent) {
      return
    }

    // todo: this is aweful, but for some reason if you read the content on the same frame it's empty ¯\_(ツ)_/¯
    setTimeout(() => {
      changeGraph((graph) => {
        const node = getNode(graph, nodeId)
        node.value = currentContent.innerText
      })
    })
  }, [changeGraph])

  const onToggleIsCollapsed = useCallback(() => {
    changeGraph((graph) => {
      const node = graph[nodeId]

      node.isCollapsed = !node.isCollapsed
    })
  }, [changeGraph])

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
    switch (evt.key) {
      case "Backspace":
        if (isMenuOpen && node.value.split(" ").reverse()[0] === "/") {
          // hacky
          setIsMenuOpen(false)
        }

        if (!contentRef.current || getCaretCharacterOffsetWithin(contentRef.current) !== 0) {
          return
        }

        evt.preventDefault()
        evt.stopPropagation()

        if (node.children.length !== 0 || !parentId) {
          return
        }

        // if it's the first child join it with parent
        if (index === 0) {
          changeGraph((graph) => {
            const parent = getNode(graph, parentId)
            delete parent.children[index]

            parent.value += node.value
            onChangeSelectedPath(path.slice(0, -1))
          })

          // ... otherwise join it with the last child of the previous sibling
        } else {
          changeGraph((graph) => {
            const parent = getNode(graph, parentId)
            const prevSibling = getNode(graph, parent.children[index - 1])

            const lastChildPath = getLastChildPath(graph, prevSibling.id)
            const prevNode = getNodeAt(graph, prevSibling.id, lastChildPath)

            if (!prevNode) {
              throw new Error("invalid state")
            }

            delete parent.children[index]
            prevNode.value += node.value

            onChangeSelectedPath(path.slice(0, -1).concat(index - 1, lastChildPath))
          })
        }

        break

      case "Enter": {
        evt.preventDefault()
        evt.stopPropagation()

        if (isMenuOpen) {
          const command = commands[commandSelection]
          command.action()

          setIsMenuOpen(false)
          setSelectedMenuIndex(0)
          return
        }

        const contentElement = contentRef.current

        if (!contentElement) {
          return
        }

        changeGraph((graph) => {
          const node = getNode(graph, nodeId)

          const caretOffset = getCaretCharacterOffsetWithin(contentElement)

          const newNode = createNode(graph, {
            value: node.value.slice(caretOffset),
          })

          node.value = node.value.slice(0, caretOffset)

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
        break
      }

      case "Tab":
        evt.preventDefault()
        evt.stopPropagation()

        if (isMenuOpen) {
          commands[commandSelection]?.tabAction?.()
          return
        }

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
        break

      case "ArrowDown": {
        if (isMenuOpen) {
          setSelectedMenuIndex(Math.min(selectedMenuIndex + 1, commands.length - 1))
          evt.preventDefault()
          evt.stopPropagation()
          return
        }

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
        break
      }

      case "ArrowUp": {
        if (isMenuOpen) {
          setSelectedMenuIndex(Math.max(selectedMenuIndex - 1, 0))
          evt.preventDefault()
          evt.stopPropagation()
          return
        }

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
        break
      }

      case "/":
        if (!isMenuOpen) {
          setIsMenuOpen(true)
        }
        break

      case "Escape": {
        if (isMenuOpen) {
          setIsMenuOpen(false)
        }
      }
    }
  }

  const onDragStart = (evt: DragEvent) => {
    evt.stopPropagation()
    var elem = document.createElement("div")
    elem.style.position = "absolute"
    elem.className = "bg-white border border-gray-200 px-2 py-1 rounded flex gap-2"
    elem.style.top = "-1000px"
    elem.innerText = node.value
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
                "pl-2": isFocused || node.value !== "",
              })}
            >
              <ContentEditable
                innerRef={contentRef}
                html={node.value}
                onChange={onChange}
                style={
                  isFocused && node.value === ""
                    ? {
                        minWidth: "5px",
                      }
                    : undefined
                }
                onBlur={() => {
                  console.log("on blur")
                  onChangeSelectedPath(undefined)
                }}
              />
            </div>

            {node.view !== undefined && (
              <div className="rounded-sm bg-purple-200 text-purple-600 font-bold text-xs px-1 py-0.5 flex items-middle mb-1 mr-1">
                <div>{node.view}</div>
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
                className="rounded-sm bg-blue-200 text-blue-600 font-bold text-xs px-1 py-0.5 flex items-middle mb-1 mr-1"
              >
                <div>{computation}</div>
                <button
                  className="material-icons"
                  style={{ fontSize: "16px" }}
                  onClick={() =>
                    changeGraph((graph) => {
                      const node = getNode(graph, nodeId)
                      node.computations = node.computations?.filter((c) => c != computation)
                      if (node.value.length === 0) {
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

      {isMenuOpen && isFocused && (
        // Command menu
        <div className="absolute z-30 rounded p-1 bg-slate-100 shadow-md w-56 text-sm">
          {commands.map((command, i) => {
            return (
              <div
                key={command.title}
                className={classNames("py-1 px-2 rounded-sm", {
                  "bg-slate-300": commandSelection === i,
                })}
              >
                {command.title}

                {command.subtitle && <p className="text-xs">{command.subtitle}</p>}
              </div>
            )
          })}
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
            "pl-4": parentIds.length > 1,
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
              onChangeSelectedPath={onChangeSelectedPath}
              onOpenNodeInNewPane={onOpenNodeInNewPane}
            />
          ))}
        </div>
      )}
    </div>
  )
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

function getNodeAt(graph: Graph, nodeId: string, path: number[]): ValueNode | undefined {
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

// adapted from: https://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container/4812022#4812022
function getCaretCharacterOffsetWithin(element: HTMLElement) {
  var caretOffset = 0
  var doc = element.ownerDocument || (element as any).document
  var win = doc.defaultView || (doc as any).parentWindow
  var sel
  if (typeof win.getSelection != "undefined") {
    sel = win.getSelection()
    if (sel.rangeCount > 0) {
      var range = win.getSelection().getRangeAt(0)
      var preCaretRange = range.cloneRange()
      preCaretRange.selectNodeContents(element)
      preCaretRange.setEnd(range.endContainer, range.endOffset)
      caretOffset = preCaretRange.toString().length
    }
  } else if ((sel = (doc as any).selection) && sel.type != "Control") {
    var textRange = sel.createRange()
    var preCaretTextRange = (doc.body as any).createTextRange()
    preCaretTextRange.moveToElementText(element)
    preCaretTextRange.setEndPoint("EndToEnd", textRange)
    caretOffset = preCaretTextRange.text.length
  }
  return caretOffset
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
