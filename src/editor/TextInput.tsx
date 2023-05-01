import { KeyboardEvent, useEffect, useRef } from "react"
import { EditorView, placeholder } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { getNode, useGraph } from "../graph"
import { autocompletion, completionStatus } from "@codemirror/autocomplete"
import { isBackspace, isDown, isEnter, isTab, isUp } from "../keyboardEvents"
import { getRefIdTokenPlugin } from "./plugins/refIdTokenPlugin"
import { functionAutocompletionContext, getMentionCompletionContext } from "./plugins/autocomplete"
import { nodeIdFacet, scopeCompartment, scopeFacet } from "./plugins/state"
import { Scope } from "../language/scopes"
import classNames from "classnames"
import {
  ExpressionResult,
  expressionResultsDecorations,
  expressionResultsField,
  setExpressionResultsEffect,
} from "./plugins/expressionResultPlugin"
import { FnNode, InlineExprNode, isLiteral } from "../language/ast"

interface TextInputProps {
  isRoot: boolean
  placeholderText?: string
  nodeId: string
  scope: Scope
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
  isRoot,
  nodeId,
  scope,
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
        getRefIdTokenPlugin(setIsHoveringOverId),
        autocompletion({
          activateOnTyping: true,
          override: [getMentionCompletionContext(changeGraph), functionAutocompletionContext],
        }),
        nodeIdFacet.of(nodeId),
        scopeFacet.of(scope),
        expressionResultsField,
        expressionResultsDecorations,
        scopeCompartment.of(scopeFacet.of(scope)),
        placeholder(isRoot ? "Untitled" : ""),
      ],
      parent: containerRef.current,
      dispatch(transaction) {
        view.update([transaction])

        if (transaction.docChanged) {
          const newValue = view.state.doc.toString()
          onChange(newValue)
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

  // update values
  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (!currentEditorView) {
      return
    }

    scope.valuePartsOfAsync().then((parts) => {
      const expressionResults: ExpressionResult[] = []
      const expressions = scope.bullet.value

      parts.forEach((part, index) => {
        const expression = expressions[index]

        if (expression instanceof InlineExprNode) {
          if (!isLiteral(expression.expr)) {
            const value = parts[index]

            if (value !== undefined) {
              expressionResults.push({
                color: scope.getProperty("color") ?? "purple",
                index,
                isExpanded: false,
                nodeId: scope.id,
                positionInSource: expression.to,
                value,
                functionName: expression.expr instanceof FnNode ? expression.expr.name : undefined,
              })
            }
          }
        }
      })

      currentEditorView.dispatch({
        effects: setExpressionResultsEffect.of(expressionResults),
      })
    })

    scope.value
  }, [editorViewRef.current, scope])

  // update scope object

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (!currentEditorView) {
      return
    }

    currentEditorView.dispatch({
      effects: scopeCompartment.reconfigure(scopeFacet.of(scope)),
    })
  }, [scope && scope.value, editorViewRef.current])

  // set focus

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (isFocused && currentEditorView && !currentEditorView.hasFocus) {
      // this is bad, but
      const focus = () => {
        if (editorViewRef.current?.hasFocus) {
          return
        }
        editorViewRef.current?.focus()

        setTimeout(focus)
      }
      focus()
    }
  }, [isFocused])

  // update value

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    // todo: it's bad to reset the expand state here, but it should be fine
    changeGraph((graph) => {
      if (!graph[nodeId]) {
        return
      }

      const node = getNode(graph, nodeId)
      node.expandedResultsByIndex = {}
    })

    if (!currentEditorView) {
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
  }, [value, editorViewRef.current])

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
      className={classNames({ "is-root": isRoot })}
      onDragOverCapture={(evt) => evt.stopPropagation()}
      onDragEnterCapture={(evt) => {
        evt.preventDefault()
        evt.stopPropagation()
      }}
      onDragLeaveCapture={(evt) => evt.stopPropagation()}
    >
      <div ref={containerRef} onKeyDownCapture={onKeyDown} onFocus={onFocus} onBlur={_onBlur}></div>
    </div>
  )
}
