import { ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { CalendarNodeView } from "./CalendarNodeView"
import { Scope } from "../language/scopes"

export const ViewDefinitions = [
  {id: "map", title: "Map", icon: "map"},
  {id: "table", title: "Table", icon: "table_chart"},
  {id: "calendar", title: "Calendar", icon: "calendar_month"},
]

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
  const { node, scope } = props

  let view
  
  switch (node.view || scope.getProperty("view")) {
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
      {view && <div className="pt-2">{view}</div>}
    </>
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
