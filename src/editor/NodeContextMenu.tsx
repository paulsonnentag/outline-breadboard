// todo: the view options should be filtered depending on the data of the node
import { createRefNode, getNode, useGraph, ValueNode } from "../graph"
import { Scope } from "../language/scopes"
import { useEffect, useId, useRef, useState } from "react"
import {
  canFormulaBeRepeated,
  getGroupedSuggestedFunctions,
  Insertion,
  repeatFormula,
} from "../language/function-suggestions"
import classNames from "classnames"
import { suggestionToExprSource } from "./TextInput"
import { parseExpression } from "../language"
import { FnNode, IdRefNode, InlineExprNode } from "../language/ast"
import { FUNCTIONS } from "../language/functions"
import { valueToString } from "./plugins/expressionResultPlugin"
import { createPortal } from "react-dom"

export interface NodeContextMenuProps {
  node: ValueNode
  scope: Scope
  isFocused: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
  onChangeIsComputationSuggestionHovered?: (hasSuggestion: boolean) => void
}

export function NodeContextMenu({
  node,
  scope,
  isFocused,
  onOpenNodeInNewPane,
  onChangeIsComputationSuggestionHovered,
}: NodeContextMenuProps) {
  const suggestionNodeId = `TEMP_SUGGESTION_${useId()}`
  const { graph, changeGraph } = useGraph()
  const nodeId = node.id
  const isMap = node.view === "map"
  const isTable = node.view === "table"
  const isCalendar = node.view === "calendar"

  const suggestedFunctions = getGroupedSuggestedFunctions(scope)

  const [suggestedFunctionButtons, setSuggestedFunctionButtons] = useState<
    { name: string; suggestion: string; result: string }[]
  >([])

  const repeatButtonRef = useRef<HTMLButtonElement>(null)
  const [repeatButtonPosition, setRepeatButtonPosition] = useState<
    { x: number; y: number } | undefined
  >()
  const [pendingInsertions, setPendingInsertions] = useState<Insertion[]>([])

  const doesBulletContainComputations = scope.bullet.value.some(
    (part) => part instanceof InlineExprNode
  )

  // When the suggested functions change, recompute results for the suggestions
  // to populate the buttons. (In an effect because computation is async)
  useEffect(() => {
    ;(async () => {
      const newSuggestedFunctionButtons = []
      for (const [name, suggestions] of Object.entries(suggestedFunctions)) {
        const defaultSuggestion = suggestions[0]
          ? `{${suggestionToExprSource(suggestions[0])}}`
          : undefined

        const hasDefaultSuggestionBeenAlreadyInserted =
          scope.source === defaultSuggestion ||
          scope.childScopes.some(
            (scope) => scope.source === defaultSuggestion && scope.id !== suggestionNodeId
          )

        if (suggestions.length === 0 || hasDefaultSuggestionBeenAlreadyInserted) {
          continue
        }

        if (!defaultSuggestion) {
          continue
        }
        const ast = parseExpression(defaultSuggestion.slice(1, -1)) as FnNode
        const parametersScopes: Scope[] = []
        for (const arg of ast.args) {
          if (arg.exp instanceof IdRefNode) {
            const transcludedScope = new Scope(graph, arg.exp.id, scope)
            transcludedScope.eval()
            parametersScopes.push(transcludedScope)
          }
        }
        const scopeWithParameters = scope.withTranscludedScopes(parametersScopes)
        const result = await ast.eval(scopeWithParameters)
        const fn = FUNCTIONS[name]
        const summaryView = fn && fn.summaryView !== undefined ? fn.summaryView : valueToString
        newSuggestedFunctionButtons.push({
          name,
          suggestion: defaultSuggestion,
          result: summaryView(result),
        })
      }

      setSuggestedFunctionButtons(newSuggestedFunctionButtons)
    })()
    return () => {}
    // bit of an ugly hack to compare suggestedFunctions by value rather than identity,
    // but seems to work fine...
  }, [JSON.stringify(suggestedFunctions)])

  const onToggleView = (view: string) => {
    changeGraph((graph) => {
      const node = graph[nodeId]

      if (node.view === view) {
        delete node.view
      } else {
        node.view = view
      }
    })
  }

  const onPopoutView = (view: string) => {
    // Create new node with refId = nodeId, view = view, add it to the root doc
    console.log(view)

    changeGraph((graph) => {
      let newNode = createRefNode(graph, nodeId)
      newNode.view = view
      onOpenNodeInNewPane(newNode.id)
    })
  }

  useEffect(() => {
    if (!isFocused) {
      resetPendingInsertions()
    }
  }, [isFocused])

  const resetPendingInsertions = () => {
    setRepeatButtonPosition(undefined)

    changeGraph((graph) => {
      for (const { parentId, childId } of pendingInsertions) {
        const parent = getNode(graph, parentId)
        const index = parent.children.indexOf(childId)
        if (index !== -1) {
          parent.children.splice(index, 1)
        }
      }

      setPendingInsertions([])
    })
  }

  if ((!isFocused && !isMap && !isTable && !isCalendar) || node.isTemporary) {
    return null
  }

  const onDelete = () => {
    changeGraph((graph) => {
      const parentScope: Scope = scope.parentScope as Scope
      const index = parentScope.childScopes.indexOf(scope)
      const parentNode = getNode(graph, parentScope.id)
      parentNode.children.splice(index, 1)
    })
  }

  const onRepeat = () => {
    changeGraph((graph) => {
      pendingInsertions.map((insertion) => {
        const node = getNode(graph, insertion.childId)
        node.isTemporary = false
      })
    })

    setPendingInsertions([])
    setRepeatButtonPosition(undefined)
  }

  const onMouseEnterRepeat = () => {
    if (!repeatButtonRef.current) {
      return
    }

    setTimeout(() => {
      changeGraph((graph) => {
        setPendingInsertions(repeatFormula(graph, scope))
      })
    }, 200)

    const { x, y } = repeatButtonRef.current?.getBoundingClientRect()
    setRepeatButtonPosition({ x, y })
  }

  const onMouseLeaveRepeat = () => {
    resetPendingInsertions()
  }

  return (
    <div className="flex w-fit gap-1">
      <>
        {!doesBulletContainComputations &&
          suggestedFunctionButtons.map(({ name, suggestion, result }) => {
            return (
              <button
                key={name}
                className="rounded text-sm flex items-center justify-center hover:bg-gray-500 hover:text-white px-1"
                onClick={() => {
                  if (!suggestion) {
                    return
                  }
                  scope.insertChildNode(suggestion)
                }}
                onMouseEnter={() => {
                  // todo: awful hack, create temporary node in graph that's not persisted in automerge
                  graph[suggestionNodeId] = {
                    children: [],
                    computedProps: {},
                    expandedResultsByIndex: {},
                    isSelected: false,
                    key: "",
                    paneWidth: 0,
                    value: suggestion,
                    view: "",
                    computations: [],
                    id: suggestionNodeId,
                    isCollapsed: false,
                    type: "value",
                    isTemporary: true,
                  }

                  if (onChangeIsComputationSuggestionHovered) {
                    onChangeIsComputationSuggestionHovered(true)
                  }

                  const tempScope = new Scope(graph, suggestionNodeId, scope)
                  scope.childScopes.unshift(tempScope)
                  scope.eval()
                }}
                onMouseLeave={() => {
                  const index = scope.childScopes.findIndex(
                    (scope) => scope.id === suggestionNodeId
                  )
                  if (index !== -1) {
                    scope.childScopes.splice(index, 1)
                  }

                  if (onChangeIsComputationSuggestionHovered) {
                    onChangeIsComputationSuggestionHovered(false)
                  }
                }}
              >
                {result}
              </button>
            )
          })}
      </>

      {pendingInsertions?.length === 0 && (
        <>
          <button
            className={classNames(
              "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
              isMap ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
            )}
            onClick={(e) => (e.metaKey ? onPopoutView("map") : onToggleView("map"))}
          >
            <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
              map
            </span>
          </button>
          <button
            className={classNames(
              "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
              isTable ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
            )}
            onClick={(e) => (e.metaKey ? onPopoutView("table") : onToggleView("table"))}
          >
            <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
              table_chart
            </span>
          </button>
          <button
            className={classNames(
              "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
              isCalendar ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
            )}
            onClick={(e) => (e.metaKey ? onPopoutView("calendar") : onToggleView("calendar"))}
          >
            <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
              calendar_month
            </span>
          </button>
        </>
      )}

      {pendingInsertions?.length === 0 && canFormulaBeRepeated(scope) && (
        <button
          className={classNames(
            "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
            isCalendar ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
          )}
          ref={repeatButtonRef}
          onClick={onRepeat}
          onMouseEnter={onMouseEnterRepeat}
        >
          <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
            repeat
          </span>
        </button>
      )}

      {repeatButtonPosition &&
        createPortal(
          <div
            style={{
              overflow: "hidden",
              position: "absolute",
              top: `${repeatButtonPosition.y}px`,
              left: `${repeatButtonPosition.x}px`,
            }}
            onMouseEnter={(evt) => evt.stopPropagation()}
            onClick={onRepeat}
          >
            <button
              className={classNames(
                "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
                isCalendar ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
              )}
              onClick={onRepeat}
              onMouseLeave={onMouseLeaveRepeat}
            >
              <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
                repeat
              </span>
            </button>
          </div>,
          document.body
        )}

      {scope.parentScope && pendingInsertions?.length === 0 && (
        <button
          className={classNames(
            "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
            isCalendar ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
          )}
          onClick={onDelete}
        >
          <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
            close
          </span>
        </button>
      )}
    </div>
  )
}
