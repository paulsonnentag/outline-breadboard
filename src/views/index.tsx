import { ValueNode } from "../graph"
import { RefObject } from "react"
import { MapNodeView } from "./MapNodeView"
import { BulletNodeView } from "./BulletNodeView"
import { RootNodeView } from "./RootNodeView"
import { WeatherAveragesNodeView } from "./WeatherAveragesNodeView"

export interface NodeViewProps {
  node: ValueNode
  isReference: boolean
  innerRef: RefObject<HTMLElement>
  onChangeValue: (value: string) => void
  isFocused: boolean
  isRoot: boolean // todo: get rid of this flag
}

export function NodeView(props: NodeViewProps) {
  const { isRoot, node } = props

  if (isRoot) {
    return <RootNodeView {...props} />
  }

  if (node.value === "/map") {
    return <div className="w-full">
      <BulletNodeView {...props} />
      <MapNodeView {...props} />
    </div>
  }

  if (node.value === "/weather-averages") {
    return <WeatherAveragesNodeView {...props} />
  }

  return <BulletNodeView {...props} />
}
