import { KeyboardEvent, useEffect, useRef } from "react"
import { EditorView } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { createNodeTree, createValueNode, getChildNodeByValue, getNode, useGraph } from "../graph"
import { autocompletion, completionStatus } from "@codemirror/autocomplete"
import { isBackspace, isDown, isEnter, isTab, isUp } from "../keyboardEvents"
import { evalBullet, evalInlineExp } from "../language"
import { getRefIdTokenPlugin } from "./plugins/refIdTokenPlugin"
import { functionAutocompletionContext, getMentionCompletionContext } from "./plugins/autocomplete"
import { bulletEvalPlugin } from "./plugins/bulletValuePlugin"
import { nodeIdFacet, parentIdsFacet } from "./plugins/facets"

interface TextInputProps {
  nodeId: string
  parentIds: string[]
  value: string
  isFocused: boolean
  focusOffset: number
  onChange: (value: string) => void
  onFocusUp: () => void
  onFocusDown: () => void
  onSplit: (position: number) => void
  onJoinWithPrev: () => void
  onFocus: () => void
  onBlur: () => void
  onIndent: () => void
  onOutdent: () => void
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export function TextInput({
  nodeId,
  parentIds,
  value,
  isFocused,
  focusOffset,
  onChange,
  onOutdent,
  onIndent,
  onSplit,
  onJoinWithPrev,
  onFocusUp,
  onFocusDown,
  onFocus,
  onBlur,
  isHoveringOverId,
  setIsHoveringOverId,
}: TextInputProps) {
  const { graph, changeGraph } = useGraph()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView>()

  // mount editor

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const view = (editorViewRef.current = new EditorView({
      doc: value,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        bulletEvalPlugin,
        getRefIdTokenPlugin(setIsHoveringOverId),
        autocompletion({
          activateOnTyping: true,
          override: [
            getMentionCompletionContext(nodeId, changeGraph),
            functionAutocompletionContext,
          ],
        }),
        nodeIdFacet.of(nodeId),
        parentIdsFacet.of(parentIds),
      ],
      parent: containerRef.current,
      dispatch(transaction) {
        view.update([transaction])

        if (transaction.docChanged) {
          onChange(view.state.doc.toString())
        }
      },
    }))

    if (isFocused && !view.hasFocus) {
      view.focus()
    }

    return () => {
      view.destroy()
    }
  }, [])

  // set focus

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (isFocused && currentEditorView && !currentEditorView.hasFocus) {
      currentEditorView.focus()

      setTimeout(() => {
        currentEditorView.dispatch({
          // update the value preemptively because value doesn't get updated if input is focused
          // this is necessary to fix bugs when new focus is caused by a split line action
          // very janky, but it kinda works
          changes: currentEditorView.state.changes({
            insert: value,
            from: 0,
            to: currentEditorView.state.doc.length,
          }),
          selection: {
            anchor: focusOffset,
            head: focusOffset,
          },
        })
      })
    }
  }, [isFocused])

  // update value

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (!currentEditorView || isFocused) {
      return
    }

    if (editorViewRef.current && editorViewRef.current.state) {
      const docValue = editorViewRef.current.state.doc.toString()

      if (docValue !== value) {
        editorViewRef.current?.dispatch(
          editorViewRef.current.state.update({
            changes: {
              from: 0,
              to: docValue.length,
              insert: value,
            },
          })
        )
      }
    }
  }, [value, editorViewRef.current, isFocused])

  useEffect(() => {
    // eval bullet to run side effects
    evalBullet(graph, nodeId)
  }, [value])

  useEffect(() => {
    const regex = /{([^}]+)}/g
    const matches = [...value.matchAll(regex)]

    if (matches.length > 0) {
      for (var _match of matches) {
        const match = _match.slice()
        const title = "computation: " + match[1]

        evalInlineExp(graph, match[0])
          .then((result: any) => {
            changeGraph((graph) => {
              const node = getNode(graph, nodeId)
              let child = getChildNodeByValue(graph, node, title)

              if (child === undefined) {
                child = createValueNode(graph, { value: title })
                child.isCollapsed = true
                node.children.push(child.id)
              }

              child.children = []
              createNodeTree(graph, child.id, result)
            })
          })
          .catch((message: string) => {
            // TODO
          })
      }
    }
  }, [value]) // TODO: It won't update when the input values change

  const onKeyDown = (evt: KeyboardEvent) => {
    const currentEditorView = editorViewRef.current
    if (!currentEditorView) {
      return
    }

    if (isEnter(evt)) {
      // ignore enter if auto complete is active
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

      evt.preventDefault()
      const ranges = currentEditorView.state.selection.ranges

      // don't perform split if current selection is a range
      if (ranges.length !== 1 || ranges[0].from !== ranges[0].to) {
        return
      }
      onSplit(ranges[0].from)
    } else if (isTab(evt)) {
      evt.preventDefault()

      if (evt.shiftKey) {
        onOutdent()
      } else {
        onIndent()
      }
    } else if (isUp(evt)) {
      // ignore up key if auto complete is active
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

      evt.preventDefault()
      onFocusUp()
    } else if (isDown(evt)) {
      // ignore down key if auto complete is active
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

      evt.preventDefault()
      onFocusDown()
    } else if (isBackspace(evt)) {
      const ranges = currentEditorView.state.selection.ranges

      // join with previous if cursor is at beginning of text
      if (ranges.length === 1 && ranges[0].from === 0 && ranges[0].to === 0) {
        evt.preventDefault()
        onJoinWithPrev()
      }
    }
  }

  const _onBlur = () => {
    const currentEditorView = editorViewRef.current
    if (currentEditorView) {
      currentEditorView.dispatch({
        selection: {
          anchor: 0,
          head: 0,
        },
      })
    }

    onBlur()
  }

  return (
    <div
      ref={containerRef}
      onKeyDownCapture={onKeyDown}
      onFocus={onFocus}
      onBlur={_onBlur}
      onDragOverCapture={(evt) => evt.stopPropagation()}
      onDragEnterCapture={(evt) => evt.stopPropagation()}
    ></div>
  )
}
