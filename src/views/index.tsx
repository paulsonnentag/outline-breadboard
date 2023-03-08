import { ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"

export interface NodeViewProps {
  node: ValueNode
  isFocused: boolean
}

export function NodeView(props: NodeViewProps) {
  const { node } = props

  if (node.value === "/map") {
    return <MapNodeView {...props} />
  }

  if (node.value === "/weather-averages") {
    return <WeatherAveragesNodeView {...props} />
  }

  return null
}
