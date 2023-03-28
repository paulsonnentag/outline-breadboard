import { Node, useGraph, ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"
import classNames from "classnames"
import { readChildrenWithProperties } from "../property"
import { readAllProperties } from "../properties"

export interface NodeViewProps {
  node: ValueNode
  isFocused: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
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

  return <div className="pl-8 pt-2">{view || ""}{node.isCollapsed && <SummaryView {...props} />}</div>
}

// todo: the view options should be filtered depending on the data of the node

export function NodeViewOptions({ node, isFocused }: NodeViewProps) {
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
        onClick={() => onToggleView("map")}
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
        onClick={() => onToggleView("table")}
      >
        <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
          table_chart
        </span>
      </button>
    </div>
  )
}

export function SummaryView(props: NodeViewProps) {
  const { graph, changeGraph } = useGraph()
  const properties = readAllProperties(graph, props.node.id)

  return (
    <div className="text-sm italic flex gap-2 relative -top-2">
      {Object.keys(properties).map(key => (
        <p><span className="text-gray-400">{key}:</span> {properties[key]}</p>
      ))}
    </div>
  )
}