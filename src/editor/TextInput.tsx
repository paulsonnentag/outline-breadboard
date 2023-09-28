import { KeyboardEvent, useEffect, useRef, useState } from "react"
import { EditorView, placeholder } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { getNode, Graph, useGraph } from "../graph"
import { closeBrackets, completionStatus } from "@codemirror/autocomplete"
import {
  isAtSign,
  isBackspace,
  isDown,
  isEnter,
  isEscape,
  isSlash,
  isTab,
  isUp,
} from "../keyboardEvents"
import {
  cursorTooltipField,
  getRefIdTokenPlugin,
  updateHoveredRefIdWidget,
} from "./plugins/refIdTokenPlugin"
import {
  graphContextCompartment,
  graphContextFacet,
  nodeIdFacet,
  onOpenPopOverFacet,
  scopeCompartment,
  scopeFacet,
} from "./plugins/state"
import { DataWithProvenance, Scope } from "../language/scopes"
import classNames from "classnames"
import {
  ExpressionResult,
  expressionResultsDecorations,
  expressionResultsField,
  setExpressionResultsEffect,
} from "./plugins/expressionResultPlugin"
import { FnNode, InlineExprNode, isLiteral } from "../language/ast"
import { expressionHighlightPlugin } from "./plugins/expressionHighlightPlugin"
import { FunctionSuggestionValue, Suggestion, SuggestionMenu } from "./SuggestionMenu"
import { FunctionSuggestion } from "../language/function-suggestions"
import { imagePlugin } from "./plugins/imagePlugin"
import { keywordHighlightPlugin } from "./plugins/keywordHighlightPlugin"
import { parseLatLng } from "../properties"
import { GeoJsonShape, Marker } from "../views/MapNodeView"
import LatLngLiteral = google.maps.LatLngLiteral
import { useOpenPopOver } from "../Root"

interface TextInputProps {
  isRoot: boolean
  placeholderText?: string
  parentIds: string[]
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
  onChangeIsMenuOpen: (isMenuOpen: boolean) => void
}

interface AutocompleteMenu {
  type: "mentions" | "functions"
  index: number
}

const LAT_LONG_REGEX = /^position: (.*)$/
function getLatLongOfNode(graph: Graph, nodeId: string): LatLngLiteral | undefined {
  if (!graph[nodeId]) {
    return undefined
  }

  const node = getNode(graph, nodeId)
  for (const childId of node.children) {
    const childNode = getNode(graph, childId)

    const match = childNode.value.match(LAT_LONG_REGEX)

    if (match) {
      return parseLatLng(match[1])
    }
  }
}

export function TextInput({
  isRoot,
  nodeId,
  parentIds,
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
  onChangeIsMenuOpen,
}: TextInputProps) {
  const onOpenPopOver = useOpenPopOver()
  const graphContext = useGraph()
  const { graph, changeGraph, setTemporaryMapObjects } = graphContext
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView>()
  const [activeAutocompleteMenu, setActiveAutocompleteMenu] = useState<
    AutocompleteMenu | undefined
  >()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const isMenuOpen = activeAutocompleteMenu !== undefined
  const search =
    activeAutocompleteMenu !== undefined
      ? value
          .slice(activeAutocompleteMenu.index + 1)
          .split(/[,)]/)[0]
          .trim()
      : undefined

  // trigger isMenuOpenEvent
  useEffect(() => {
    onChangeIsMenuOpen(isMenuOpen)
  }, [isMenuOpen])

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
        getRefIdTokenPlugin(setIsHoveringOverId, onOpenPopOver),
        nodeIdFacet.of(nodeId),
        onOpenPopOverFacet.of(onOpenPopOver),
        expressionResultsField,
        expressionResultsDecorations,
        expressionHighlightPlugin,
        scopeCompartment.of(scopeFacet.of(scope)),
        graphContextCompartment.of(graphContextFacet.of(graphContext)),
        placeholder(isRoot ? "Untitled" : ""),
        closeBrackets(),
        imagePlugin,
        cursorTooltipField,
        keywordHighlightPlugin,
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

    /*if (isFocused && !view.hasFocus) {
      view.focus()
    }*/

    return () => {
      view.destroy()
    }
  }, [])

  // update hover state of refIdTokens
  useEffect(() => {
    updateHoveredRefIdWidget(isHoveringOverId)
  }, [isHoveringOverId])

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
                onOpenPopOver,
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

  // update graph context

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (!currentEditorView) {
      return
    }

    currentEditorView.dispatch({
      effects: graphContextCompartment.reconfigure(graphContextFacet.of(graphContext)),
    })
  }, [graphContext])

  // set focus
  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (isFocused && currentEditorView && !currentEditorView.hasFocus) {
      // this is bad, but ... ¯\_(ツ)_/¯

      const focus = () => {
        if (editorViewRef.current?.hasFocus) {
          return
        }
        editorViewRef.current?.focus()

        // ... yes we need another timeout here
        setTimeout(() => {
          editorViewRef.current?.dispatch({
            selection: {
              anchor: focusOffset,
              head: focusOffset,
            },
          })
        })

        setTimeout(focus)
      }
      focus()
    }
  }, [isFocused, focusOffset])

  // close menu if no longer focused
  useEffect(() => {
    if (!isFocused && activeAutocompleteMenu) {
      setActiveAutocompleteMenu(undefined)
      setTemporaryMapObjects(undefined)
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

  const onSelectSuggestion = async (suggestion: Suggestion) => {
    const currentEditorView = editorViewRef.current
    if (!currentEditorView || !activeAutocompleteMenu) {
      return
    }

    // call before insert handler if defined, this allows suggestions like POI suggestions create nodes before the suggested reference is inserted
    const beforeInsert = suggestion.beforeInsert
    if (beforeInsert) {
      await beforeInsert(graph, changeGraph)
    }

    let expr =
      suggestion.value.type === "function"
        ? `{${suggestionToExprSource(suggestion.value)}}`
        : suggestion.value.expression

    // hack, wait till next frame so newly created nodes are not undefined
    setTimeout(() => {
      currentEditorView.dispatch(
        currentEditorView.state.update({
          changes: {
            from: activeAutocompleteMenu.index,
            to: currentEditorView.state.selection.main.head,
            insert: expr,
          },
        })
      )
      setActiveAutocompleteMenu(undefined)
      setTemporaryMapObjects(undefined)
    })
  }

  const onChangeSuggestions = (suggestions: Suggestion[]) => {
    const objects: DataWithProvenance<Marker | GeoJsonShape>[] = []

    suggestions.forEach(({ value }) => {
      if (value.type === "mention") {
        // expect to be #[....]
        const id = value.expression.slice(2, -1)
        const latLng = getLatLongOfNode(graph, id)

        if (latLng) {
          objects.push({
            scope: new Scope(graph, id, undefined, undefined),
            data: {
              position: latLng,
            },
          })
        }
      }
    })

    setTemporaryMapObjects({
      parentIds,
      objects,
    })
    setSuggestions(suggestions)
  }

  const onChangeSelectedSuggestionIndex = (index: number) => {
    const suggestion = suggestions[index]

    if (suggestion && suggestion.value.type === "mention") {
      // assume it's an id ref like "#[...]"
      const id = suggestion.value.expression.slice(2, -1)
      setIsHoveringOverId(id)
    } else {
      setIsHoveringOverId(undefined)
    }

    setSelectedSuggestionIndex(index)
  }

  const onKeyDown = (evt: KeyboardEvent) => {
    const currentEditorView = editorViewRef.current
    if (!currentEditorView) {
      return
    }

    if (isAtSign(evt)) {
      const cursorPos = currentEditorView.state.selection.main.head
      const isCursorPosSeparatedBySpace =
        cursorPos === 0 || currentEditorView.state.sliceDoc(cursorPos - 1, cursorPos) === " "

      if (!activeAutocompleteMenu && isCursorPosSeparatedBySpace) {
        // hack: wait till next frame so text has updated
        setTimeout(() => {
          setActiveAutocompleteMenu({
            type: "mentions",
            index: cursorPos,
          })

          onChangeSelectedSuggestionIndex(0)
        })
      }
    } else if (isSlash(evt)) {
      const cursorPos = currentEditorView.state.selection.main.head

      // hacky way to figure out if we are inside a formula
      let isInsideOfExpression = false

      const chars = value.split("")
      for (let i = 0; i < cursorPos; i++) {
        const char = chars[i]
        if (char === "{") {
          isInsideOfExpression = true
        } else if (char === "}") {
          isInsideOfExpression = false
        }
      }
      if (isInsideOfExpression) {
        return
      }

      const isCursorPosSeparatedBySpace =
        cursorPos === 0 || currentEditorView.state.sliceDoc(cursorPos - 1, cursorPos) === " "

      if (!activeAutocompleteMenu && isCursorPosSeparatedBySpace) {
        // hack: wait till next frame so text has updated
        setTimeout(() => {
          setActiveAutocompleteMenu({
            type: "functions",
            index: cursorPos,
          })
          onChangeSelectedSuggestionIndex(0)
        })
      }
    } else if (isEscape(evt)) {
      setActiveAutocompleteMenu(undefined)
      setTemporaryMapObjects(undefined)
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
        onChangeSelectedSuggestionIndex(
          selectedSuggestionIndex > 0 ? selectedSuggestionIndex - 1 : 0
        )
        evt.preventDefault()
      } else if (completionStatus(currentEditorView.state) === null) {
        onFocusUp()
        evt.preventDefault()
      }
    } else if (isDown(evt)) {
      // ignore down key if auto complete is active
      if (isMenuOpen) {
        onChangeSelectedSuggestionIndex(
          selectedSuggestionIndex < suggestions.length - 1
            ? selectedSuggestionIndex + 1
            : suggestions.length - 1
        )
        evt.preventDefault()
      } else if (completionStatus(currentEditorView.state) === null) {
        onFocusDown()
        evt.preventDefault()
      }
    } else if (isBackspace(evt)) {
      if (
        isMenuOpen &&
        currentEditorView.state.selection.main.head - 1 === activeAutocompleteMenu.index
      ) {
        setActiveAutocompleteMenu(undefined)
        setTemporaryMapObjects(undefined)
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

      {isMenuOpen && search !== undefined && (
        <SuggestionMenu
          mode={activeAutocompleteMenu.type}
          scope={scope}
          search={search}
          suggestions={suggestions}
          onChangeSuggestions={onChangeSuggestions}
          focusedIndex={selectedSuggestionIndex}
          onSelectSuggestion={onSelectSuggestion}
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      )}
    </div>
  )
}

export function suggestionToExprSource(suggestion: FunctionSuggestion | FunctionSuggestionValue) {
  return `${suggestion.name}(${(suggestion.arguments ?? [])
    .map(({ label, expression }) => `${label}: ${expression ?? ""}`)
    .join(", ")})`
}
