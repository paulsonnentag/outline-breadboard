import { Node, useGraph, ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"
import classNames from "classnames"

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

  if (!view) {
    return null
  }

  return <div className="pl-8 pt-2">{view}</div>
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
