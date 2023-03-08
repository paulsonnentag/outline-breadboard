import { createNode, getNode, Graph, Node, useGraph, ValueNode } from "./graph"
import {
  DragEvent,
  FocusEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import classNames from "classnames"
import { last } from "./utils"
import ContentEditable from "react-contenteditable"
import { NodeView } from "./views"

interface OutlineEditorProps {
  nodeId: string
  index: number
  parentIds: string[]
  isParentDragged?: boolean
  path: number[]
  selectedPath?: number[]
  onChangeSelectedPath: (path: number[]) => void
}

export function OutlineEditor({
  nodeId,
  path,
  index,
  parentIds,
  isParentDragged,
  selectedPath,
  onChangeSelectedPath,
}: OutlineEditorProps) {
  const { graph, changeGraph } = useGraph()
  const [isBeingDragged, setIsBeingDragged] = useState(false)
  const [isDraggedOver, setIsDraggedOver] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const node = getNode(graph, nodeId)
  const isFocused = (selectedPath && arePathsEqual(selectedPath, path)) ?? false
  const parentId = last(parentIds)
  const grandParentId = parentIds[parentIds.length - 2]
  const isRoot = parentId === undefined

  const onChange = useCallback(() => {
    const currentContent = contentRef.current

    if (!currentContent) {
      return
    }

    // todo: this is aweful, but for some reason if you read the content on the same frame it's empty ¯\_(ツ)_/¯
    setTimeout(() => {
      changeGraph((graph) => {
        const node = getNode(graph, nodeId)

        console.log(graph)

        node.value = currentContent.innerText
      })
    })
  }, [changeGraph])

  const onFocus = useCallback(
    (evt: FocusEvent) => {
      evt.stopPropagation()

      onChangeSelectedPath(path)
    },
    [onChangeSelectedPath]
  )

  const onKeyDown = (evt: KeyboardEvent) => {
    switch (evt.key) {
      case "Backspace":
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
            prevSibling.children[newIndex] = node.id

            onChangeSelectedPath(path.slice(0, -1).concat(index - 1, newIndex))
          })
        }
        break

      case "ArrowDown": {
        if (!selectedPath) {
          return
        }

        if (node.children.length > 0) {
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
        // can't go up if node has no parent
        if (!parentId) {
          return
        }

        // if first child go up to parent
        if (index === 0) {
          onChangeSelectedPath(path.slice(0, -1))
          return
        }

        // ... otherwise pick last child of previous sibling
        const parent = getNode(graph, parentId)
        const prevSibling = getNode(graph, parent.children[index - 1])
        onChangeSelectedPath(
          getLastChildPath(graph, prevSibling.id, path.slice(0, -1).concat(index - 1))
        )

        evt.stopPropagation()
        evt.preventDefault()
        break
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

    evt.dataTransfer.setDragImage(elem, -10, -10)
    evt.dataTransfer.setData("application/node", JSON.stringify({ id: nodeId, parentId, index }))
    setIsBeingDragged(true)
  }

  const onDragEnd = () => {
    setIsBeingDragged(false)
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

    changeGraph((graph) => {
      const node = getNode(graph, nodeId)
      const sourceParent = getNode(graph, sourceParentId)
      delete sourceParent.children[sourceIndex]

      if (node.children.length !== 0) {
        // important to get node from mutable graph
        node.children.unshift(sourceId)
      } else if (parentId) {
        const insertIndex = parentId === sourceParentId && sourceIndex < index ? index : index + 1

        const parent = getNode(graph, parentId)
        parent.children.splice(insertIndex, 0, sourceId)
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
    <div
      draggable={parentId !== undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseDown={() => {
        console.log("on mouse down")
      }}
    >
      <div
        className={classNames("flex flex-1 gap-1", {
          "text-gray-300": isBeingDragged || isParentDragged,
        })}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        <div className="w-full">
          <div
            className={classNames("flex gap-2 items-center", {
              "text-xl": isRoot,
            })}
          >
            {!isRoot && (
              <span
                style={{
                  fontSize: "8px",
                }}
                className={classNames("material-icons text-gray-500", {
                  invisible: !isFocused && node.value == "",
                })}
              >
                circle
              </span>
            )}
            <ContentEditable innerRef={contentRef} html={node.value} onChange={onChange} />
          </div>
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

      <div className={classNames("w-full", !isRoot ? "pl-4" : "")}>
        <NodeView node={node} isFocused={isFocused} />

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
          />
        ))}
      </div>
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
