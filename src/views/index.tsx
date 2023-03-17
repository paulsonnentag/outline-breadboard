import { Node, NodeValue } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"

export interface NodeViewProps {
  node: Node<NodeValue>
  isFocused: boolean
  onOpenNodeInNewPane: (nodeId: string) => void
}

export function NodeView(props: NodeViewProps) {
  const { node } = props

  return (
    <>
      {/* Views */}
      {node.view === "map" && <MapNodeView {...props} />}
      {node.view?.startsWith("table") && <TableNodeView {...props} />}

      {/* Computations */}
      {node.computations?.includes("weather-averages") && <WeatherAveragesNodeView {...props} />}
    </>
  )
}
