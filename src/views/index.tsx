import { ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"

export interface NodeViewProps {
  node: ValueNode
  isFocused: boolean
}

export function NodeView(props: NodeViewProps) {
  const { node } = props

  return (<>
    {/* Views */}
    {node.view === "map" && <MapNodeView {...props} />}

    {/* Computations */}
    {node.value.split(" ").includes("/weather-averages") && <WeatherAveragesNodeView {...props} />}
  </>)
}
