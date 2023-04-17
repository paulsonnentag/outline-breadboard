import { createRefNode, useGraph, ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import classNames from "classnames"
import { Scope } from "../language/scopes"

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
  }

  return (
    <>
      {node.isCollapsed && (
        <div className="pl-6">
          <SummaryView {...props} />
        </div>
      )}
      {view && <div className="pt-2">{view}</div>}
    </>
  )
}

// todo: the view options should be filtered depending on the data of the node
export interface NodeViewOptionsProps {
  node: ValueNode
  isFocused: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
}

export function NodeViewOptions({ node, isFocused, onOpenNodeInNewPane }: NodeViewOptionsProps) {
  const { graph, changeGraph } = useGraph()
  const nodeId = node.id
  const isMap = node.view === "map"
  const isTable = node.view === "table"

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

  if (!isFocused && !isMap && !isTable) {
    return null
  }

  return (
    <div className="flex w-fit gap-1">
      <button
        className={classNames(
          "bg-gray-800 rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-800 hover:text-white",
          isMap ? "bg-gray-800 text-white" : "bg-transparent text-gray-600"
        )}
        onClick={(e) => (e.metaKey ? onPopoutView("map") : onToggleView("map"))}
      >
        <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
          map
        </span>
      </button>
      <button
        className={classNames(
          "bg-gray-800 rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-800 hover:text-white",
          isTable ? "bg-gray-800 text-white" : "bg-transparent text-gray-600"
        )}
        onClick={(e) => (e.metaKey ? onPopoutView("table") : onToggleView("table"))}
      >
        <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
          table_chart
        </span>
      </button>
    </div>
  )
}

export function SummaryView({ scope }: NodeViewProps) {
  const properties = scope.getAllProperties()

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
