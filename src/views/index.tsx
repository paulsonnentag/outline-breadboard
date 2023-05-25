import { ValueNode } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { CalendarNodeView } from "./CalendarNodeView"
import { Scope } from "../language/scopes"
import { useEffect, useState } from "react"

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
  const [ viewId, setViewId ] = useState<string | undefined>(undefined)

  useEffect(() => {
    const fetchProp = async () => {
      const viewId = await scope.getPropertyAsync("view")
      setViewId(viewId)
    }
    fetchProp()
  }, [props])

  let view

  switch (node.view || viewId) {
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
  const [ properties, setProperties ] = useState<{
    [name: string]: any;
} | undefined>(undefined)

  useEffect(() => {
    const fetchProp = async () => {
      const properties = await props.scope.getAllProperties()
      setProperties(properties)
    }
    fetchProp()
  }, [props])

  return (
    <div className="text-sm italic flex gap-2">
      {properties && Object.entries(properties).map(([key, value]) => (
        <p key={key}>
          <span className="text-gray-400">{key}:</span> {value}
        </p>
      ))}
    </div>
  )
}
