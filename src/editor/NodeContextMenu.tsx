// todo: the view options should be filtered depending on the data of the node
import { createRefNode, useGraph, ValueNode } from "../graph"
import { Scope } from "../language/scopes"
import { useId } from "react"
import { getGroupedSuggestedFunctions } from "../language/function-suggestions"
import classNames from "classnames"

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

  if (!isFocused && !isMap && !isTable && !isCalendar) {
    return null
  }

  const suggestedFunctions = getGroupedSuggestedFunctions(scope)

  return (
    <div className="flex w-fit gap-1">
      <>
        {Object.entries(suggestedFunctions).map(([name, suggestions]) => {
          const defaultSuggestion = suggestions[0] ? `{${suggestions[0].expression}}` : undefined

          const hasDefaultSuggestionBeenAlreadyInserted = scope.childScopes.some(
            (scope) => scope.source === defaultSuggestion && scope.id !== suggestionNodeId
          )

          if (suggestions.length === 0 || hasDefaultSuggestionBeenAlreadyInserted) {
            return null
          }

          return (
            <button
              key={name}
              className="rounded text-sm flex items-center justify-center hover:bg-gray-500 hover:text-white px-1"
              onClick={() => {
                if (!defaultSuggestion) {
                  return
                }
                scope.insertChildNode(defaultSuggestion)
              }}
              onMouseEnter={() => {
                // todo: awful hack create temporary node in graph that's not persisted in automerge
                graph[suggestionNodeId] = {
                  children: [],
                  computedProps: {},
                  expandedResultsByIndex: {},
                  isSelected: false,
                  key: "",
                  paneWidth: 0,
                  value: `{${suggestions[0].expression}}`,
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
                const index = scope.childScopes.findIndex((scope) => scope.id === suggestionNodeId)
                if (index !== -1) {
                  scope.childScopes.splice(index, 1)
                }

                if (onChangeIsComputationSuggestionHovered) {
                  onChangeIsComputationSuggestionHovered(false)
                }
              }}
            >
              + {name}
            </button>
          )
        })}
      </>
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
    </div>
  )
}
