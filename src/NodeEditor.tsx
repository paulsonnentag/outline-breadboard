import { Graph, Node, useGraph, useNode } from "./graph"
import ContentEditable, { ContentEditableEvent } from "react-contenteditable"
import { useCallback, useRef, KeyboardEvent, useEffect, DragEvent, useState } from "react"
import { v4 } from "uuid"
import classNames from "classnames"
import { last } from "./utils"

interface NodeEditorProps {
  id: string
  index: number
  parentIds: string[]
  isParentDragged?: boolean
  path: number[]
  selectedPath: number[]
  onChangeSelectedPath: (path: number[]) => void
}

interface ContentEditableCallbacks {
  onFocus: () => void
  onBlur: () => void
  onChange: (evt: ContentEditableEvent) => void
  onKeyDown: (evt: KeyboardEvent) => void
}

export function NodeEditor({
  id,
  path,
  index,
  parentIds,
  isParentDragged,
  selectedPath,
  onChangeSelectedPath,
}: NodeEditorProps) {
  const { node, changeNode } = useNode(id)
  const { graph, changeGraph } = useGraph()
  const [isBeingDragged, setIsBeingDragged] = useState(false)
  const [isDraggedOver, setIsDraggedOver] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const isFocused = arePathsEqual(selectedPath, path)
  const parentId = last(parentIds)
  const grandParentId = parentIds[parentIds.length - 2]

  // ugly hack because content editable doesn't handle updating event handler functions
  const callbacksRef = useRef<ContentEditableCallbacks>({
    onChange: () => {},
    onFocus: () => {},
    onKeyDown: () => {},
    onBlur: () => {},
  })

  callbacksRef.current.onChange = useCallback(
    (evt: ContentEditableEvent) => {
      changeNode((node) => (node.value = evt.target.value))
    },
    [changeNode]
  )

  callbacksRef.current.onFocus = () => {
    onChangeSelectedPath(path)
  }

  callbacksRef.current.onKeyDown = (evt: KeyboardEvent) => {
    switch (evt.key) {
      case "Backspace":
        if (!contentRef.current || getCaretCharacterOffsetWithin(contentRef.current) !== 0) {
          return
        }

        evt.preventDefault()

        if (node.children.length !== 0 || !parentId) {
          return
        }

        // if it's the first child join it with parent
        if (index === 0) {
          changeGraph((graph) => {
            const parent = graph[parentId]
            delete parent.children[index]

            parent.value += node.value
            onChangeSelectedPath(path.slice(0, -1))
          })

          // ... otherwise join it with the last child of the previous sibling
        } else {
          changeGraph((graph) => {
            const parent = graph[parentId]
            const prevSibling = graph[parent.children[index - 1]]

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

        const contentElement = contentRef.current

        if (!contentElement) {
          return
        }

        changeGraph((graph) => {
          const node = graph[id]

          const caretOffset = getCaretCharacterOffsetWithin(contentElement)

          const newNode = {
            id: v4(),
            value: node.value.slice(caretOffset),
            children: [],
          }

          graph[newNode.id] = newNode
          node.value = node.value.slice(0, caretOffset)

          if (node.children.length === 0 && parentId) {
            const parent = graph[parentId]
            parent.children.splice(index + 1, 0, newNode.id)
            onChangeSelectedPath(path.slice(0, -1).concat(index + 1))
          } else {
            if (parentId) {
              const parent = graph[parentId]

              if (caretOffset === 0) {
                node.value = newNode.value
                graph[newNode.id].value = ""

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
            const parent = graph[parentId]
            const parentIndex = path[path.length - 2]
            const grandParent = graph[grandParentId]

            delete parent.children[index]
            const newIndex = parentIndex + 1
            grandParent.children.splice(newIndex, 0, id)
            onChangeSelectedPath(path.slice(0, -2).concat(newIndex))
          })
        } else {
          // indent

          // can't indent root or nodes that are already indented to the max
          if (index == 0 || parentId === undefined) {
            return
          }

          changeGraph((graph) => {
            const parent = graph[parentId]
            const prevSibling = graph[parent.children[index - 1]]

            const newIndex = prevSibling.children.length

            delete parent.children[index]
            prevSibling.children[newIndex] = node.id

            onChangeSelectedPath(path.slice(0, -1).concat(index - 1, newIndex))
          })
        }
        break

      case "ArrowDown": {
        if (node.children.length > 0) {
          onChangeSelectedPath(path.concat(0))
          return
        }

        const nextPath = getNextPath(graph, selectedPath, node, parentIds)

        if (nextPath) {
          onChangeSelectedPath(nextPath)
        }
        evt.preventDefault()
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
        const parent = graph[parentId]
        const prevSibling = graph[parent.children[index - 1]]
        onChangeSelectedPath(
          getLastChildPath(graph, prevSibling.id, path.slice(0, -1).concat(index - 1))
        )

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
    evt.dataTransfer.setData("application/node", JSON.stringify({ id, parentId, index }))
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
      const sourceParent = graph[sourceParentId]
      delete sourceParent.children[sourceIndex]

      if (node.children.length !== 0) {
        // important to get node from mutable graph
        graph[node.id].children.unshift(sourceId)
      } else if (parentId) {
        const insertIndex = parentId === sourceParentId && sourceIndex < index ? index : index + 1

        const parent = graph[parentId]
        parent.children.splice(insertIndex, 0, sourceId)
      }
    })
  }

  useEffect(() => {
    if (contentRef.current && isFocused && document.activeElement !== contentRef.current) {
      contentRef.current.focus()
    }
  }, [isFocused])

  if (!node) {
    return <div className="text-red-500"> •️ Invalid node id {JSON.stringify(id)}</div>
  }

  let contentEditableView = (
    <ContentEditable
      innerRef={contentRef}
      onKeyDown={(evt) => callbacksRef.current.onKeyDown(evt)}
      html={node.value}
      onChange={(evt) => callbacksRef.current.onChange(evt)}
      onFocus={(evt) => callbacksRef.current.onFocus()}
    />
  )

  return (
    <div draggable={parentId !== undefined} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {parentId ? (
        <div
          className={classNames("flex flex-1 gap-1", {
            "text-gray-300": isBeingDragged || isParentDragged,
          })}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <span
            className={classNames({
              invisible: !isFocused && node.value === "",
            })}
          >
            •
          </span>
          ️ {contentEditableView}
        </div>
      ) : (
        <div className="text-xl mb-2">{contentEditableView}</div>
      )}

      {parentId && (
        <div
          className={classNames(
            "w-full border-b-2",
            {
              "ml-4": node.children.length,
            },
            isDraggedOver ? "border-blue-500" : "border-white"
          )}
        />
      )}

      {node.children.length > 0 && (
        <div className={classNames("w-full", parentId ? "pl-4" : "")}>
          {node.children.map((childId, index) => (
            <NodeEditor
              isParentDragged={isBeingDragged}
              key={index}
              id={childId}
              index={index}
              parentIds={parentIds.concat(id)}
              path={path.concat(index)}
              selectedPath={selectedPath}
              onChangeSelectedPath={onChangeSelectedPath}
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
  const node = graph[nodeId]

  const lastIndex = node.children.length - 1

  if (lastIndex === -1) {
    return prefixPath
  }

  const lastChild = node.children[lastIndex]
  return getLastChildPath(graph, lastChild, prefixPath.concat(lastIndex))
}

function getNodeAt(graph: Graph, nodeId: string, path: number[]): Node | undefined {
  let currentNode = graph[nodeId]

  for (const index of path) {
    const childId = currentNode.children[index]

    if (!childId) {
      return undefined
    }

    currentNode = graph[childId]
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

  const parent = graph[parentId]
  const index = last(selectedPath)

  if (index + 1 < parent.children.length) {
    return selectedPath.slice(0, -1).concat(index + 1)
  }

  return getNextPath(graph, selectedPath.slice(0, -1), parent, parentIds.slice(0, -1))
}
