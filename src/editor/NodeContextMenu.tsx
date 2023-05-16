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
import colors, { allColors } from "../colors"

export interface NodeContextMenuProps {
  node: ValueNode
  scope: Scope
  isFocusedOnNode: boolean
  isAnotherFocused: boolean
  isHoveredOnNode: boolean
  hideFunctionButtons: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
  onChangeIsComputationSuggestionHovered?: (hasSuggestion: boolean) => void
}

export function NodeContextMenu({
  node,
  scope,
  isFocusedOnNode,
  isAnotherFocused,
  isHoveredOnNode,
  hideFunctionButtons,
  onOpenNodeInNewPane,
  onChangeIsComputationSuggestionHovered,
}: NodeContextMenuProps) {
  const suggestionNodeId = `TEMP_SUGGESTION_${useId()}`
  const { graph, changeGraph } = useGraph()
  const [isHovering, setIsHovering] = useState(false)
  const [isHoveringOverButton, setIsHoveringOverButton] = useState<string | undefined>(undefined)
  const nodeId = node.id
  const isMap = node.view === "map"
  const isTable = node.view === "table"
  const isCalendar = node.view === "calendar"

  const suggestedFunctions = getGroupedSuggestedFunctions(scope)

  const [suggestedFunctionButtons, setSuggestedFunctionButtons] = useState<
    { name: string; suggestion: string; result: string; icon: string }[]
  >([])

  const repeatButtonRef = useRef<HTMLButtonElement>(null)
  const [repeatButtonPosition, setRepeatButtonPosition] = useState<
    { x: number; y: number } | undefined
  >()
  const [pendingInsertions, setPendingInsertions] = useState<Insertion[]>([])

  const doesBulletContainComputations = scope.bullet.value.some(
    (part) => part instanceof InlineExprNode
  )

  const showFunctionButtons =
    !doesBulletContainComputations && node.value !== "" && !hideFunctionButtons

  const colorPalette = colors.getColors(scope.getProperty("color") || scope.lookupValue("color"))

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
        const resultText = summaryView(result)
        const spaceIndex = resultText.indexOf(" ")
        const icon = resultText.slice(0, spaceIndex)
        const _resultText = resultText.slice(spaceIndex + 1).trim()
        newSuggestedFunctionButtons.push({
          name,
          suggestion: defaultSuggestion,
          icon,
          result: _resultText,
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
    if (!isFocusedOnNode && !repeatButtonPosition) {
      resetPendingInsertions()
    }
  }, [isFocusedOnNode, repeatButtonPosition])

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

  if (node.isTemporary) {
    return null
  }

  if (!isFocusedOnNode && !isHovering && !isMap && !isTable && !isCalendar) {
    return null
  }

  if (isAnotherFocused) {
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
    <div
      className="absolute right-1 flex flex-col gap-1"
      onMouseOver={(e) => setIsHovering(true)}
      onMouseLeave={(e) => setIsHovering(false)}
    >
      {scope.parentScope && pendingInsertions?.length === 0 && (
        <button
          className={classNames(
            "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white bg-transparent text-gray-600",
            { "opacity-0 pointer-events-none": !isFocusedOnNode && !isHovering }
          )}
          onClick={onDelete}
        >
          <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
            close
          </span>
        </button>
      )}

      {pendingInsertions?.length === 0 && (
        <div className="flex flex-col rounded bg-gray-100">
          <div className="relative">
            {isHovering && 
              <div className={classNames("absolute z-50 right-8 pointer-events-none rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center bg-white px-1", isHoveringOverButton === "map" ? "opacity-100" : "opacity-50")}>Map</div>
            }
            <button
              className={classNames(
                "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
                isMap ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
              )}
              onMouseOver={e => setIsHoveringOverButton("map")}
              onMouseLeave={e => isHoveringOverButton === "map" && setIsHoveringOverButton(undefined)}
              onClick={(e) => (e.metaKey ? onPopoutView("map") : onToggleView("map"))}
            >
              <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
                map
              </span>
            </button>
          </div>

          <div className="relative">
            {isHovering && 
              <div className={classNames("absolute z-50 right-8 pointer-events-none rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center bg-white px-1", isHoveringOverButton === "table" ? "opacity-100" : "opacity-50")}>Table</div>
            }
            <button
              className={classNames(
                "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
                isTable ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
              )}
              onMouseOver={e => setIsHoveringOverButton("table")}
              onMouseLeave={e => isHoveringOverButton === "table" && setIsHoveringOverButton(undefined)}
              onClick={(e) => (e.metaKey ? onPopoutView("table") : onToggleView("table"))}
            >
              <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
                table_chart
              </span>
            </button>
          </div>

          <div className="relative">
            {isHovering && 
              <div className={classNames("absolute z-50 right-8 pointer-events-none rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center bg-white px-1", isHoveringOverButton === "calendar" ? "opacity-100" : "opacity-50")}>Calendar</div>
            }
            <button
              className={classNames(
                "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
                isCalendar ? "bg-gray-500 text-white" : "bg-transparent text-gray-600"
              )}

              onMouseOver={e => setIsHoveringOverButton("calendar")}
              onMouseLeave={e => isHoveringOverButton === "calendar" && setIsHoveringOverButton(undefined)}
              onClick={(e) => (e.metaKey ? onPopoutView("calendar") : onToggleView("calendar"))}
            >
              <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
                calendar_month
              </span>
            </button>
          </div>
        </div>
      )}

      {showFunctionButtons &&
        suggestedFunctionButtons.map(({ name, suggestion, result, icon }) => {
          return (
            <div key={name} className="relative">
              {isHovering && (
                <div className="absolute z-50 right-8 opacity-80 pointer-events-none rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center bg-white px-1">
                  {result}
                </div>
              )}
              <button
                className={classNames(
                  "rounded text-sm w-[24px] h-[24px] flex items-center justify-center bg-gray-100 hover:bg-gray-500 hover:text-white px-1"
                )}
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
                  scope.childScopes.push(tempScope)
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
                {icon}
              </button>
            </div>
          )
        })}

        <div 
          className="relative"
          onMouseOver={e => setIsHoveringOverButton("color")}
          onMouseLeave={e => isHoveringOverButton === "color" && setIsHoveringOverButton(undefined)}
        >
          {isHoveringOverButton === "color" ? (
            <div className="absolute z-50 right-0 pr-8">
              <div className="opacity-80 hover:opacity-100 rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center gap-0.5 bg-white px-1 cursor-pointer">
                {Object.keys(colors.allColors).map(key => { 
                  const suggestion = `color: ${key}`
                  
                  return (
                    <button 
                      className={classNames(
                        "rounded-full w-[22px] h-[22px] px-1 border-2 border-gray-100 hover:border-gray-500"
                      )}
                      style={{ "background": colors.getColors(key)["500"] }}
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
                        scope.childScopes.push(tempScope)
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
                    </button>
                  )
                })}
              </div>
            </div>
          ) : isHovering && (
            <div className="absolute z-50 right-8 opacity-80 pointer-events-none rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center bg-white px-1 cursor-pointer">
              Color picker
            </div>
          )}

          <button
            className={classNames(
              "rounded-full w-[22px] h-[22px] px-1 border-2 border-gray-100 hover:border-gray-500"
            )}
            style={{ "background": colorPalette["500"] }}
          >
          </button>
        </div>

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
    </div>
  )
}
