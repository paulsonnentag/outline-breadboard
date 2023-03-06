import { Node } from "../graph"
import { RefObject } from "react"
import { MapNodeView } from "./MapNodeView"
import { BulletNodeView } from "./BulletNodeView"
import { RootNodeView } from "./RootNodeView"

export interface NodeViewProps {
  node: Node
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
    return <MapNodeView {...props} />
  }

  return <BulletNodeView {...props} />
}
