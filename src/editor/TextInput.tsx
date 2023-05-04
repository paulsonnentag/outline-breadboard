import { KeyboardEvent, useEffect, useRef, useState } from "react"
import { EditorView, placeholder } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { getNode, useGraph } from "../graph"
import { autocompletion, closeBrackets, completionStatus } from "@codemirror/autocomplete"
import { isBackspace, isDown, isEnter, isEscape, isSlash, isTab, isUp } from "../keyboardEvents"
import { getRefIdTokenPlugin } from "./plugins/refIdTokenPlugin"
import { getMentionCompletionContext } from "./plugins/autocomplete"
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
import { expressionHighlightPlugin } from "./plugins/expressionHighlightPlugin"
import { Suggestion, SuggestionMenu } from "./SuggestionMenu"
import { FunctionSuggestion, getSuggestedFunctions } from "../language/function-suggestions"

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
  const [activeSlashIndex, setActiveSlashIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const isMenuOpen = activeSlashIndex !== -1
  const search = activeSlashIndex !== -1 ? value.slice(activeSlashIndex + 1) : undefined

  // load suggestions
  useEffect(() => {
    if (search === undefined) {
      return
    }

    getSuggestions(scope, search).then((newSuggestions: Suggestion[]) => {
      setSuggestions(newSuggestions)
    })
  }, [search])

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
          override: [getMentionCompletionContext(changeGraph) /*functionAutocompletionContext*/],
        }),
        nodeIdFacet.of(nodeId),
        expressionResultsField,
        expressionResultsDecorations,
        expressionHighlightPlugin,
        scopeCompartment.of(scopeFacet.of(scope)),
        placeholder(isRoot ? "Untitled" : ""),
        closeBrackets(),
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

  const onSelectSuggestion = (suggestion: Suggestion) => {
    const currentEditorView = editorViewRef.current
    if (!currentEditorView) {
      return
    }

    const expr = `{${suggestionToExprSource(suggestion)}}`

    currentEditorView.dispatch(
      currentEditorView.state.update({
        changes: {
          from: activeSlashIndex,
          to: currentEditorView.state.selection.main.head,
          insert: expr,
        },
      })
    )

    setActiveSlashIndex(-1)
  }

  const onKeyDown = (evt: KeyboardEvent) => {
    const currentEditorView = editorViewRef.current
    if (!currentEditorView) {
      return
    }

    if (isSlash(evt)) {
      // Do not open the suggestion menu for computations if the
      // data autocomplete menu is already open
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }
      setActiveSlashIndex(currentEditorView.state.selection.main.head)
      setSelectedSuggestionIndex(0)
    } else if (isEscape(evt)) {
      setActiveSlashIndex(-1)
    } else if (isEnter(evt)) {
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

      // ignore enter if auto complete is active
      if (isMenuOpen) {
        const selectedSuggestion = suggestions[selectedSuggestionIndex]
        onSelectSuggestion(selectedSuggestion)
      } else {
        const ranges = currentEditorView.state.selection.ranges

        // don't perform split if current selection is a range
        if (ranges.length !== 1 || ranges[0].from !== ranges[0].to) {
          return
        }
        onSplit(ranges[0].from)
      }

      evt.preventDefault()
    } else if (isTab(evt)) {
      evt.preventDefault()

      if (evt.shiftKey) {
        onOutdent()
      } else {
        onIndent()
      }
    } else if (isUp(evt)) {
      // ignore up key if auto complete is active
      if (isMenuOpen) {
        setSelectedSuggestionIndex((index) => (index > 0 ? index - 1 : 0))
      } else {
        onFocusUp()
      }

      evt.preventDefault()
    } else if (isDown(evt)) {
      // ignore down key if auto complete is active
      if (isMenuOpen) {
        setSelectedSuggestionIndex((index) =>
          index < suggestions.length - 1 ? index + 1 : suggestions.length - 1
        )
      } else {
        onFocusDown()
      }
      evt.preventDefault()
    } else if (isBackspace(evt)) {
      if (isMenuOpen) {
        setActiveSlashIndex(-1)
      }

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

      {isMenuOpen && (
        <SuggestionMenu
          scope={scope}
          suggestions={suggestions}
          focusedIndex={selectedSuggestionIndex}
          selectSuggestion={onSelectSuggestion}
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      )}
    </div>
  )
}

async function getSuggestions(scope: Scope, search: string): Promise<Suggestion[]> {
  return getSuggestedFunctions(scope)
    .filter((suggestion) => suggestion.name.toLowerCase().startsWith(search.toLowerCase()))
    .map((suggestion) => {
      //        const inlineExpr = `{${expression}}`

      return {
        title: suggestion.name,
        icon: suggestion.icon,
        arguments: suggestion.arguments,
      }
    })
}

export function suggestionToExprSource(suggestion: Suggestion | FunctionSuggestion) {
  const name = "title" in suggestion ? suggestion.title : suggestion.name

  return `${name}(${(suggestion.arguments ?? [])
    .map(({ label, value }) => `${label}: ${value ?? ""}`)
    .join(", ")})`
}
