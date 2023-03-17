import {
  createNode,
  createRecordNode,
  getNode,
  Graph,
  ImageValue,
  isNodeCollapsed,
  isRef,
  Node,
  NodeValue,
  RecordDef,
  useGraph,
  createRef,
} from "./graph"
import {
  DragEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import classNames from "classnames"
import { isString, last } from "./utils"
import ContentEditable from "react-contenteditable"
import { NodeView } from "./views"
import { createPlaceNode, InputProperty, LatLongProperty, useGoogleApi } from "./views/MapNodeView"
import AutocompleteResponse = google.maps.places.AutocompleteResponse

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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [poiResults, setPoiResults] = useState<Command[]>([])
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0)
  const contentRef = useRef<HTMLElement>(null)
  const node = getNode(graph, nodeId)
  const isFocused = (selectedPath && arePathsEqual(selectedPath, path)) ?? false
  const parentId = last(parentIds)
  const grandParentId = parentIds[parentIds.length - 2]
  const isRoot = parentId === undefined
  const isReferenceNode = isRef(node.value)
  const isCollapsed = isNodeCollapsed(graph, nodeId) && !isRoot
  const isCollapsable = node.children.length > 0

  const google = useGoogleApi()
  const placesAutocomplete = useMemo(
    () => (google ? new google.maps.places.AutocompleteService() : undefined),
    [google]
  )

  const commandQuery =
    isFocused &&
    typeof node.value === "string" &&
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

          node.value = (node.value as string)
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
          node.value = (node.value as string)
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
          node.value = (node.value as string)
            .split(" ")
            .filter((token) => !token.startsWith("/"))
            .join(" ")

          const indexOfInput = InputProperty.getChildIndexesOfNode(graph, nodeId)[0]

          if (indexOfInput === undefined) {
            const input = createNode(graph, { value: "input:" })

            // Look for default pos
            const indexOfPos = LatLongProperty.getChildIndexesOfNode(graph, nodeId)[0]

            if (indexOfPos === undefined) {
              input.children.push(
                createNode(graph, {
                  value: "position: 37.2296, -80.4139",
                }).id
              )
            } else {
              const posId = node.children[indexOfPos]
              const value = getNode(graph, posId).value ?? "position: 37.2296, -80.4139"
              input.children.push(
                createNode(graph, {
                  value,
                }).id
              )
            }

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

          let tokens = (node.value as string).split(" ")
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
  const tokens = typeof node.value === "string" ? node.value.split(" ") : []
  const poiIndex = tokens.indexOf("/poi")

  // fetch pois

  const query = poiIndex >= 0 ? tokens.slice(poiIndex + 1).join(" ") : null

  useEffect(() => {
    if (!query || !placesAutocomplete) {
      setPoiResults([])
      return
    }

    placesAutocomplete
      .getPlacePredictions({
        input: query,
      })
      .then((result: AutocompleteResponse) => {
        console.log("fetch", result)

        setPoiResults(
          result.predictions.map((prediction) => ({
            title: prediction.description,
            action: async () => {
              if (!graph[prediction.place_id]) {
                await createPlaceNode(changeGraph, prediction.place_id)
              }

              changeGraph((graph) => {
                const refNode = createNode(graph, { value: createRef(prediction.place_id) })
                onReplaceNode(refNode.id)
              })
            },
          }))
        )
      })
  }, [query, placesAutocomplete])

  commands = commands.concat(poiResults)

  const commandSelection = Math.min(selectedMenuIndex, commands.length - 1)

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
    if (evt.key === "Backspace") {
      if (isMenuOpen && (node.value as string).split(" ").reverse()[0] === "/") {
        // hacky
        setIsMenuOpen(false)
      }

      if (!contentRef.current || getCaretCharacterOffset(contentRef.current) !== 0) {
        return
      }

      evt.preventDefault()
      evt.stopPropagation()

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
    } else if (evt.key === "Enter") {
      {
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

        if (!isString(node.value)) {
          return
        }

        changeGraph((graph) => {
          const node = getNode(graph, nodeId)
          const caretOffset = getCaretCharacterOffset(contentElement)

          const newNode = createNode(graph, {
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
    } else if (evt.key === "Tab") {
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
    } else if (evt.key === "ArrowDown" || (evt.key === "n" && evt.ctrlKey)) {
      {
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
      }
    } else if (evt.key === "ArrowUp" || (evt.key === "p" && evt.ctrlKey)) {
      {
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
      }
    } else if (evt.key === "/") {
      if (!isMenuOpen) {
        setIsMenuOpen(true)
      }
    } else if (evt.key === "Escape") {
      {
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
        nodeIdToInsert = createNode(graph, { value: createRef(sourceId) }).id
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
              <NodeValueView
                value={node.value}
                innerRef={contentRef}
                onChange={onChange}
                isFocused={isFocused}
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

interface NodeValueViewProps {
  value: NodeValue
  innerRef: RefObject<HTMLElement>
  onChange: (value: NodeValue) => void
  isFocused: boolean
  onBlur: () => void
}

function NodeValueView(props: NodeValueViewProps) {
  const { graph } = useGraph()
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

function getLabelOfNode(node: Node<NodeValue>): string {
  if (isString(node.value)) {
    return node.value
  }

  return node.value.type
}

interface TextNodeValueView extends NodeValueViewProps {
  value: string
}

function TextNodeValueView({ value, innerRef, onChange, isFocused, onBlur }: TextNodeValueView) {
  const _onChange = useCallback(() => {
    const currentContent = innerRef.current

    if (!currentContent) {
      return
    }

    // todo: this is aweful, but for some reason if you read the content on the same frame it's empty ¯\_(ツ)_/¯
    setTimeout(() => {
      onChange(currentContent.innerText)
    })
  }, [onChange])

  return (
    <ContentEditable
      innerRef={innerRef}
      html={value}
      onChange={_onChange}
      style={
        isFocused && value === ""
          ? {
              minWidth: "5px",
            }
          : undefined
      }
      onBlur={onBlur}
    />
  )
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

function getNodeAt(graph: Graph, nodeId: string, path: number[]): Node<NodeValue> | undefined {
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
function getCaretCharacterOffset(element: HTMLElement) {
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

// adapted from https://stackoverflow.com/questions/6249095/how-to-set-the-caret-cursor-position-in-a-contenteditable-element-div#answer-6249440
function setCaretCharacterOffset(element: HTMLElement, offset: number) {
  var range = document.createRange()
  var selection = window.getSelection()

  try {
    range.setStart(element.childNodes[0], offset) // todo: this throws sometimes
    range.collapse(true)

    selection!.removeAllRanges()
    selection!.addRange(range)
  } catch (err) {
    console.log("bad")
  }
}

function getNextPath(
  graph: Graph,
  selectedPath: number[],
  node: Node<NodeValue>,
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
