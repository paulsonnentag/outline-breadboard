import { ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"

export interface NodeViewProps {
  node: ValueNode
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
      {node.value.split(" ").includes("/weather-averages") && (
        <WeatherAveragesNodeView {...props} />
      )}
    </>
  )
}
