import { Graph, useGraph, useNode } from "./graph"
import ContentEditable, { ContentEditableEvent } from "react-contenteditable"
import { useCallback, useRef, KeyboardEvent, useEffect } from "react"
import { v4 } from "uuid"

interface NodeEditorProps {
  id: string
  index: number
  parentId?: string
  grandParentId?: string
  path: number[]
  selectedPath: number[]
  onFocusNext: (deferred: boolean) => void
  onFocusPrev: (deferred: boolean) => void
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
  parentId,
  grandParentId,
  selectedPath,
  onFocusPrev,
  onFocusNext,
  onChangeSelectedPath,
}: NodeEditorProps) {
  const { node, changeNode } = useNode(id)
  const { graph, changeGraph } = useGraph()
  const contentRef = useRef<HTMLElement>(null)

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
    if (evt.key === "Enter") {
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
    }

    /*
    if (this.props.onDeleteNote && evt.key === "Delete" && evt.ctrlKey) {
      this.props.onDeleteNote();
      evt.preventDefault();
      return;
    }


     */

    switch (evt.key) {
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

      case "ArrowDown":
        onFocusNext(false)
        evt.preventDefault()
        break

      case "ArrowUp":
        onFocusPrev(false)
        evt.preventDefault()
        break
    }
  }

  const onChildFocusNext = (index: number, delegated: boolean) => {
    const currentlyFocusedNode = graph[node.children[index]]

    // if node has children, select first child
    if (!delegated && currentlyFocusedNode.children.length > 0) {
      onChangeSelectedPath(path.concat([index, 0]))

      // if node has next siblings, select next sibling
    } else if (index + 1 < node.children.length) {
      if (currentlyFocusedNode) {
        onChangeSelectedPath(path.concat(index + 1))
      }

      // ... otherwise delegate to parent
    } else {
      onFocusNext(true)
    }
  }

  const onChildFocusPrev = (index: number) => {
    if (index === 0) {
      onChangeSelectedPath(path)
    } else {
      const prevSibling = graph[node.children[index - 1]]
      onChangeSelectedPath(getLastChildPath(graph, prevSibling.id, path.concat(index - 1)))
    }
  }

  useEffect(() => {
    if (
      contentRef.current &&
      arePathsEqual(selectedPath, path) &&
      document.activeElement !== contentRef.current
    ) {
      contentRef.current.focus()
    }
  }, [selectedPath, path])

  if (!node) {
    return <div className="text-red-500"> •️ Invalid node id {id}</div>
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
    <div>
      {parentId ? (
        <div className="flex gap-1">•️ {contentEditableView}</div>
      ) : (
        <div className="text-xl mb-2">{contentEditableView}</div>
      )}

      {node.children.length > 0 && (
        <div className={parentId ? "pl-4" : ""}>
          {node.children.map((childId, index) => (
            <NodeEditor
              onFocusNext={(delegated) => onChildFocusNext(index, delegated)}
              onFocusPrev={(delegated) => onChildFocusPrev(index)}
              key={index}
              id={childId}
              index={index}
              parentId={id}
              grandParentId={parentId}
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
