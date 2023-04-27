import { createRefNode, useGraph, ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { CalendarNodeView } from "./CalendarNodeView"
import classNames from "classnames"
import { Scope } from "../language/scopes"
import {
  getGroupedSuggestedFunctions,
  getSuggestedFunctions,
} from "../language/function-suggestions"

export interface NodeViewProps {
  node: ValueNode
  scope: Scope
  isFocused: boolean
  fullpane: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export function NodeView(props: NodeViewProps) {
  const { node } = props

  let view

  switch (node.view) {
    case "map":
      view = <MapNodeView {...props} />
      break
    case "table":
      view = <TableNodeView {...props} />
      break
    case "calendar":
      view = <CalendarNodeView {...props} />
      break
  }

  return (
    <>
      {node.isCollapsed && (
        <div className="pl-6">
          <SummaryView scope={props.scope} />
        </div>
      )}
      {view && <div className="pt-2">{view}</div>}
    </>
  )
}

// todo: the view options should be filtered depending on the data of the node
export interface NodeViewOptionsProps {
  node: ValueNode
  scope: Scope
  isFocused: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
}

export function NodeViewOptions({
  node,
  scope,
  isFocused,
  onOpenNodeInNewPane,
}: NodeViewOptionsProps) {
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
          if (suggestions.length === 0) {
            return null
          }

          return (
            <button
              key={name}
              className="rounded text-sm flex items-center justify-center hover:bg-gray-500 hover:text-white px-1"
              onClick={() => {
                scope.setProperty("computed", `{${suggestions[0].expression}}`)
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

interface SummaryViewProps {
  scope: Scope
}

export function SummaryView(props: SummaryViewProps) {
  const properties = props.scope.getAllProperties()

  return (
    <div className="text-sm italic flex gap-2">
      {Object.entries(properties).map(([key, value]) => (
        <p key={key}>
          <span className="text-gray-400">{key}:</span> {value}
        </p>
      ))}
    </div>
  )
}
