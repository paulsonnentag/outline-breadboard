import { ValueNode, useGraph } from "../graph"
import { MapNodeView } from "./MapNodeView"
import { TableNodeView } from "./TableNodeView"
import { CalendarNodeView } from "./CalendarNodeView"
import { Scope } from "../language/scopes"
import { useEffect, useState } from "react"
import classNames from "classnames"

export const ViewDefinitions = [
  { id: "map", title: "Map", icon: "map" },
  //  { id: "table", title: "Table", icon: "table_chart" },
  { id: "calendar", title: "Calendar", icon: "calendar_month" },
]

export interface NodeViewProps {
  refNodeId?: string
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
  const { graph, changeGraph } = useGraph()
  const [viewId, setViewId] = useState<string | undefined>(undefined)
  const [isHoveringOverButton, setIsHoveringOverButton] = useState<string | undefined>(undefined)

  useEffect(() => {
    const fetchProp = async () => {
      const viewId = await scope.getPropertyAsync("view")
      setViewId(viewId)
    }
    fetchProp()
  }, [props])

  // this is a goofy workaround for items in the map view disappearing because properties haven't resolved yet; works by triggering re-render once all props in entire subtree have resolved
  const [data, setData] = useState<any>(undefined)

  useEffect(() => {
    const checkData = async () => {
      const data = await waitForProps(scope)
      setData(data)
    }
    checkData()
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
      {props.fullpane && (
        <div className="flex gap-2 justify-between items-center">
          <div className="is-root">{node.value}</div>

          <div className="flex rounded bg-gray-100">
            <div className="rounded text-xs h-[24px] whitespace-nowrap flex items-center justify-center bg-white px-1">
              {ViewDefinitions.find((v) => v.id === (node.view || viewId))?.title ?? ""}
            </div>

            {ViewDefinitions.map((view) => (
              <div key={view.id}>
                <button
                  className={classNames(
                    "rounded text-sm w-[24px] h-[24px] flex items-center justify-center hover:bg-gray-500 hover:text-white",
                    (node.view || viewId) == view.id
                      ? "bg-gray-500 text-white"
                      : "bg-transparent text-gray-600"
                  )}
                  onMouseEnter={(evt) => {
                    setIsHoveringOverButton(view.id)
                  }}
                  onMouseLeave={(evt) => {
                    isHoveringOverButton === view.id && setIsHoveringOverButton(undefined)
                  }}
                  onMouseDown={(evt) => {
                    evt.stopPropagation()
                    evt.preventDefault()

                    if (props.refNodeId) {
                      changeGraph((g) => {
                        g[props.refNodeId!].view = view.id
                      })
                    }
                  }}
                >
                  <span className="material-icons-outlined" style={{ fontSize: "16px" }}>
                    {view.icon}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {view && <div className="pt-2">{view}</div>}
    </>
  )
}

interface SummaryViewProps {
  scope: Scope
}

export function SummaryView(props: SummaryViewProps) {
  const [properties, setProperties] = useState<
    | {
        [name: string]: any
      }
    | undefined
  >(undefined)

  useEffect(() => {
    const fetchProp = async () => {
      const properties = await props.scope.getAllPropertiesAsync()
      setProperties(properties)
    }
    fetchProp()
  }, [props])

  return (
    <div className="text-sm italic flex gap-2">
      {properties &&
        Object.entries(properties).map(([key, value]) => (
          <p key={key}>
            <span className="text-gray-400">{key}:</span> {value}
          </p>
        ))}
    </div>
  )
}

async function waitForProps(scope: Scope): Promise<any> {
  return new Promise(async (resolve) => {
    let props = await scope.getAllPropertiesAsync()

    for (const childScope of scope.childScopes) {
      await waitForProps(childScope)
    }

    resolve(props)
  })
}
