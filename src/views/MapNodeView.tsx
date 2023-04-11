import { NodeViewProps } from "./index"
import { useEffect, useId, useRef, useState } from "react"
import {
  createRecordNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  useGraph,
  ValueNode,
} from "../graph"
import classNames from "classnames"
import { v4 } from "uuid"
import { useStaticCallback } from "../hooks"
import { OutlineEditor } from "../editor/OutlineEditor"
import { createRoot } from "react-dom/client"
import debounce from "lodash.debounce"
import {
  DataWithProvenance,
  extractComputedValuesInNodeAndBelow,
  extractDataInNodeAndBelow,
  readColorFromList,
  readLatLng,
} from "../properties"
import { placesServiceApi, useGoogleApi } from "../google"
import { isSelectionHandlerActive, triggerSelect } from "../selectionHandler"
import colors from "../colors"
import { getIsHovering } from "../utils"

// this is necessary for tailwind to include the css classes
const COLORS = [
  "border-blue-700",
  "border-green-700",
  "border-yellow-700",
  "border-red-700",
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-red-500",
]

export function MapNodeView({
  node,
  fullpane,
  onOpenNodeInNewPane,
  isHoveringOverId,
  setIsHoveringOverId,
}: NodeViewProps) {
  const graphContext = useGraph()
  const { graph, changeGraph } = graphContext
  const [geoJsonValues, setGeoJsonValues] = useState<DataWithProvenance<any>[]>([])

  const latLngData: DataWithProvenance<google.maps.LatLngLiteral>[] = extractDataInNodeAndBelow(
    graph,
    node.id,
    (graph, node) => readLatLng(graph, node.id)
  )

  useEffect(() => {
    extractComputedValuesInNodeAndBelow(graph, node.id, (value) => {
      if (typeof value === "object" && value.geometry) {
        return value.geometry
      }
    }).then((data) => {
      setGeoJsonValues(data)
    })
  }, [graph, node.id])

  /*

  const childNodeIdsWithLatLng = getChildIdsWith(
    graph,
    node.id,
    (node, graph) =>!== undefined
  )

   */

  // readChildrenWithProperties(graph, inputsNodeId, [LatLongProperty])
  // const zoom = ZoomProperty.readValueOfNode(graph, inputsNodeId)[0]
  // const center: google.maps.LatLngLiteral = LatLongProperty.readValueOfNode(graph, inputsNodeId)[0]

  const google = useGoogleApi()
  const mapId = useId()
  const mapRef = useRef<google.maps.Map>()
  const mapElementRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerView[]>([])
  const popOverRef = useRef<PopoverOutline>()
  const listenersRef = useRef<google.maps.MapsEventListener[]>([])
  const dataLayersRef = useRef<DataWithProvenance<google.maps.Data>[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const minBounds = google && getMinBounds(latLngData.map((node) => node.data))

  /* if (indexOfInput === undefined) {
    console.log("No map inputs")
    return <></>
  } */

  // mount map

  useEffect(() => {
    const currentMapElement = mapElementRef.current
    if (!currentMapElement || !google) {
      return
    }

    const currentMap = (mapRef.current = new google.maps.Map(currentMapElement, {
      mapId,
      zoom: 11,
      center: { lat: 50.775555, lng: 6.083611 },
      disableDefaultUI: true,
      gestureHandling: "greedy",
    }))

    if (minBounds) {
      currentMap.fitBounds(minBounds)
    }

    const popup = (popOverRef.current = createPopoverOutline())

    popup.setMap(currentMap)
    popup.hide()

    const centerChangedListener = currentMap.addListener("center_changed", onChangeMapView)
    const zoomChangedListener = currentMap.addListener("zoom_changed", onChangeMapView)
    const clickListener = currentMap.addListener("click", onClickMap)
    const mouseDownListener = currentMap.addListener("mousedown", () => setIsPanning(true))
    const mouseUpListener = currentMap.addListener("mouseup", () => {
      changeGraph((graph) => {
        if (!mapRef.current) {
          return
        }

        // writeBackMapState(graph, inputsNodeId, mapRef.current)
        setIsPanning(false)
      })
    })

    markersRef.current = []
    listenersRef.current.forEach((listener) => listener.remove())
    listenersRef.current = []

    return () => {
      centerChangedListener.remove()
      zoomChangedListener.remove()
      clickListener.remove()
      mouseDownListener.remove()
      mouseUpListener.remove()
    }
  }, [mapElementRef.current, google])

  const onChangeMapView = useStaticCallback(
    debounce(() => {
      const currentMap = mapRef.current

      if (!currentMap) {
        return
      }

      changeGraph((graph) => {
        // writeBackMapState(graph, inputsNodeId, currentMap)
      })
    }, 500)
  )

  const onClickMap = useStaticCallback(async (evt: any) => {
    const currentPopOver = popOverRef.current
    if (!currentPopOver) {
      return
    }

    const placeId: string = evt.placeId
    if (!placeId) {
      currentPopOver.hide()
      currentPopOver.position = undefined
      return
    }

    evt.stop()
    evt.cancelBubble = true

    if (!graph[placeId]) {
      await createPlaceNode(changeGraph, placeId)
    }

    // defer to selection handler if it's active
    if (isSelectionHandlerActive()) {
      triggerSelect(placeId)
      return
    }

    // todo: hacky, we don't mutate the graph here, we just use the mutation function to reference the new update graph
    // the graph in the current scope contains still the old data
    changeGraph((graph) => {
      const position = readLatLng(graph, placeId)

      currentPopOver.position = position
      currentPopOver.rootId = placeId
      currentPopOver.show()
      currentPopOver.draw()
      currentPopOver.render({ graphContext, onOpenNodeInNewPane })
    })
  })

  // update bounds and zoom level if underlying data changes

  /*
  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !google || referencedNodeIdsWithLatLng.length === 0 || isDragging || isPanning) {
      return
    }

    // if there is a manual zoom and center value is set use that



    if (zoom !== undefined && center !== undefined) {
      if (currentMap.getZoom() !== zoom) {
        currentMap.setZoom(zoom)
      }

      if (!currentMap.getCenter()?.equals(new google.maps.LatLng(center))) {
        currentMap.setCenter(center)
      }

      return
    }
    // but if we don't have this delay the zoom is not set correctly on initial load
  }, [childNodeIdsWithLatLng, google, isDragging, isPanning]) */

  // render markers on map

  useEffect(() => {
    if (!mapRef.current || !google) {
      return
    }

    const totalMarkers = latLngData.length

    // cleanup unused markers and event listener

    const markersToDelete = markersRef.current.slice(totalMarkers)

    listenersRef.current.forEach((listener) => {
      listener.remove()
    })
    listenersRef.current = []

    markersToDelete.forEach((marker: google.maps.marker.AdvancedMarkerView) => {
      marker.map = null
    })

    const prevMarkers = (markersRef.current = markersRef.current.slice(0, totalMarkers))

    // update / create new markers

    for (let i = 0; i < latLngData.length; i++) {
      const nodeWithLatLngData = latLngData[i]

      const isHovering = getIsHovering(
        graph,
        nodeWithLatLngData.nodeId,
        nodeWithLatLngData.parentIds,
        isHoveringOverId
      )
      const setColor = readColorFromList(graph, [
        nodeWithLatLngData.nodeId,
        ...nodeWithLatLngData.parentIds.slice().reverse(),
      ])?.trim()
      const accentColors = setColor ? colors.accentColors(setColor) : colors.defaultAccentColors

      let mapsMarker = prevMarkers[i] // reuse existing markers, if it already exists

      if (!mapsMarker) {
        const element = document.createElement("div")

        mapsMarker = new google.maps.marker.AdvancedMarkerView({
          map: mapRef.current,
          content: element,
          position: nodeWithLatLngData.data,
        })

        prevMarkers.push(mapsMarker)
      }

      const markerContent = mapsMarker.content as HTMLDivElement

      markerContent.className = classNames(
        `w-[16px] h-[16px] rounded-full cursor-pointer border border-white`
        // hoveredItemId === poiResult.id ? "bg-lime-500 border-lime-700" : "bg-red-500 border-red-700"
      )

      markerContent.style.transform = `translate(0, 8px)`

      if (isHovering) {
        markerContent.style.backgroundColor = accentColors[5]
      } else {
        markerContent.style.backgroundColor = accentColors[2]
      }

      listenersRef.current.push(
        mapsMarker.addListener("click", () => {
          // defer to selection handler if active
          if (isSelectionHandlerActive()) {
            triggerSelect(nodeWithLatLngData.nodeId)
            return
          }

          changeGraph((graph) => {
            const node = getNode(graph, nodeWithLatLngData.nodeId)

            node.isCollapsed = false
          })

          if (popOverRef.current) {
            popOverRef.current.position = nodeWithLatLngData.data
            popOverRef.current.rootId = nodeWithLatLngData.nodeId
            popOverRef.current.show()
            popOverRef.current.draw()
            popOverRef.current.render({ graphContext, onOpenNodeInNewPane })
          }

          mapRef.current?.panTo(nodeWithLatLngData.data)
        })
      )

      markerContent.onmouseenter = () => {
        setIsHoveringOverId(nodeWithLatLngData.nodeId)
      }
      markerContent.onmouseleave = () => {
        setIsHoveringOverId(undefined)
      }

      mapsMarker.position = nodeWithLatLngData.data
      mapsMarker.zIndex = isHovering ? 10 : 0
    }
  }, [latLngData, mapRef.current, isHoveringOverId])

  // render geoJson on map
  useEffect(() => {
    if (!google) {
      return
    }

    const currentMap = mapRef.current

    if (!currentMap) {
      return
    }

    // delete previous features
    for (const layerData of dataLayersRef.current) {
      layerData.data.setMap(null)
    }

    dataLayersRef.current = []

    for (const geoJsonValue of geoJsonValues) {
      const setColor = readColorFromList(graph, [
        geoJsonValue.nodeId,
        ...geoJsonValue.parentIds.slice().reverse(),
      ])?.trim()
      const accentColors = setColor ? colors.accentColors(setColor) : colors.defaultAccentColors

      const dataLayer = new google.maps.Data()
      dataLayer.addGeoJson(geoJsonValue.data)
      dataLayer.setStyle({
        strokeColor: accentColors[2],
        strokeWeight: 2,
      })

      dataLayer.setMap(currentMap)
      dataLayersRef.current.push({
        nodeId: geoJsonValue.nodeId,
        parentIds: geoJsonValue.parentIds,
        data: dataLayer,
      })
    }
  }, [google, geoJsonValues, mapRef])

  // update hover effect of geoJson
  useEffect(() => {
    for (const dataLayerValue of dataLayersRef.current) {
      const setColor = readColorFromList(graph, [
        dataLayerValue.nodeId,
        ...dataLayerValue.parentIds.slice().reverse(),
      ])?.trim()
      const accentColors = setColor ? colors.accentColors(setColor) : colors.defaultAccentColors

      const isHovering = getIsHovering(
        graph,
        dataLayerValue.nodeId,
        dataLayerValue.parentIds,
        isHoveringOverId
      )

      dataLayerValue.data.setStyle({
        strokeColor: isHovering ? accentColors[5] : accentColors[2],
        zIndex: isHovering ? 10 : 0,
      })
    }
  }, [isHoveringOverId, dataLayersRef.current])

  // render pop over

  useEffect(() => {
    if (popOverRef.current) {
      popOverRef.current.render({ graphContext, onOpenNodeInNewPane })
    }
  }, [Math.random()])

  const onFitBounds = () => {
    if (latLngData.length === 0) {
      return
    }

    const currentMap = mapRef.current

    if (!currentMap || !google) {
      return
    }

    if (minBounds) {
      currentMap.fitBounds(minBounds, 25)
    }

    if (latLngData.length === 1) {
      currentMap.setZoom(11)
    }
  }

  return (
    <div
      className={
        fullpane
          ? "w-auto absolute left-0 right-0 bottom-0 top-16 min-h-[400px]"
          : "w-auto h-[400px] border border-gray-200 relative"
      }
    >
      <div
        onFocus={(event) => {
          event.stopPropagation()
        }}
        draggable
        onDragStartCapture={(evt) => {
          if (isPopupBubble(evt.target as HTMLElement)) {
            return
          }

          evt.stopPropagation()
          evt.preventDefault()
          setIsDragging(true)
        }}
        onMouseUp={() => setIsDragging(false)}
        ref={mapElementRef}
        onDragStart={(evt) => evt.stopPropagation()}
        className="w-full h-full"
      ></div>
      <div className="top-0 left-0 right-0 bottom-0 absolute pointer-events-none flex items-center justify-center">
        <div className="material-icons text-gray-500">add</div>
      </div>
      {latLngData.length > 0 && (
        <button
          className="absolute bottom-4 right-4 bg-white border-gray-200 rounded p-2 flex items-center shadow border border-gray-200"
          onClick={onFitBounds}
        >
          <div className="material-icons text-gray-500">center_focus_weak</div>
        </button>
      )}
    </div>
  )
}

function isPopupBubble(element: HTMLElement): boolean {
  if (element.classList.contains("popup-bubble")) {
    return true
  }

  if (!element.parentElement) {
    return false
  }

  return isPopupBubble(element.parentElement)
}

interface PopoverOutline {
  render: (props: {
    graphContext: GraphContextProps
    onOpenNodeInNewPane: (nodeId: string) => void
  }) => void
  position?: google.maps.LatLngLiteral
  rootId: string | undefined
  hide: () => void
  show: () => void
  draw: () => void
  setMap: (map: google.maps.Map) => void
}

// we have to construct the class lazily, because the Google Maps library is loaded async
// that means google.maps.OverlayView is only defined once the library is loaded
function createPopoverOutline(position?: google.maps.LatLngLiteral): PopoverOutline {
  class PopoverOutline extends google.maps.OverlayView {
    public position
    private containerDiv
    private root
    public rootId: string | undefined

    constructor(position?: google.maps.LatLngLiteral) {
      super()
      this.position = position

      const element = document.createElement("div")

      const container = document.createElement("div")
      element.appendChild(container)

      this.root = createRoot(container)

      element.className = "popup-bubble"

      // This zero-height div is positioned at the bottom of the bubble.
      const bubbleAnchor = document.createElement("div")

      bubbleAnchor.classList.add("popup-bubble-anchor")
      bubbleAnchor.appendChild(element)
      // This zero-height div is positioned at the bottom of the tip.
      this.containerDiv = document.createElement("div")
      this.containerDiv.classList.add("popup-container")
      this.containerDiv.appendChild(bubbleAnchor)
      // Optionally stop clicks, etc., from bubbling up to the map.
      PopoverOutline.preventMapHitsAndGesturesFrom(this.containerDiv)
    }

    /** Called when the popup is added to the map. */
    onAdd() {
      this.getPanes()!.floatPane.appendChild(this.containerDiv)
    }

    /** Called when the popup is removed from the map. */
    onRemove() {
      if (this.containerDiv.parentElement) {
        this.containerDiv.parentElement.removeChild(this.containerDiv)
      }
    }

    hide() {
      this.containerDiv.style.display = "none"
    }

    show() {
      this.containerDiv.style.display = "inherit"
    }

    render({
      graphContext,
      onOpenNodeInNewPane,
    }: {
      graphContext: GraphContextProps
      onOpenNodeInNewPane: (nodeId: string) => void
    }) {
      if (!this.rootId) {
        return
      }

      this.root.render(
        <PopoverOutlineView
          graphContext={graphContext}
          rootId={this.rootId}
          onOpenNodeInNewPane={onOpenNodeInNewPane}
        />
      )
    }

    /** Called each frame when the popup needs to draw itself. */
    draw() {
      if (!this.position) {
        return
      }

      const divPosition = this.getProjection().fromLatLngToDivPixel(this.position)

      // if marker is still rendered (any zoom level above 11) shift up a bit that it doesn't cover the marker
      const zoom = this.getMap()?.getZoom()
      if (zoom && zoom > 11) {
        divPosition!.y = divPosition!.y - 30
      }

      // Hide the popup when it is far out of view.
      const display =
        Math.abs(divPosition!.x) < 4000 && Math.abs(divPosition!.y) < 4000 ? "block" : "none"

      if (display === "block") {
        this.containerDiv.style.left = divPosition!.x + "px"
        this.containerDiv.style.top = divPosition!.y + "px"
      }

      if (this.containerDiv.style.display !== display) {
        this.containerDiv.style.display = display
      }
    }
  }

  return new PopoverOutline(position)
}

interface PopoverOutlineViewProps {
  graphContext: GraphContextProps
  rootId: string
  onOpenNodeInNewPane: (nodeId: string) => void
}

function PopoverOutlineView({
  graphContext,
  rootId,
  onOpenNodeInNewPane,
}: PopoverOutlineViewProps) {
  const [selectedPath, setSelectedPath] = useState<number[] | undefined>([])
  const [focusOffset, setFocusOffset] = useState<number>(0)

  return (
    <GraphContext.Provider value={graphContext}>
      <OutlineEditor
        focusOffset={focusOffset}
        nodeId={rootId}
        index={0}
        path={[]}
        parentIds={[]}
        selectedPath={selectedPath}
        onChangeSelectedPath={(newSelectedPath, newFocusOffset = 0) => {
          setSelectedPath(newSelectedPath)
          setFocusOffset(newFocusOffset)
        }}
        onOpenNodeInNewPane={onOpenNodeInNewPane}
        onReplaceNode={() => {}} // it's not possible to replace the root nodeId in the pop over
        isHoveringOverId={undefined} /* TODO */
        setIsHoveringOverId={() => {}} /* TODO */
      />
    </GraphContext.Provider>
  )
}

export async function createPlaceNode(
  changeGraph: (fn: (graph: Graph) => void) => void,
  placeId: string
): Promise<ValueNode> {
  return new Promise((resolve) => {
    placesServiceApi.then((placesService) => {
      placesService.getDetails(
        {
          placeId,
          fields: [
            "name",
            "rating",
            "photos",
            "website",
            "formatted_phone_number",
            "formatted_address",
            "geometry",
          ],
        },
        (result) => {
          const name = result?.name ?? "Unnamed"
          const website = result?.website
          const address = result?.formatted_address
          const phone = result?.formatted_phone_number
          const rating = result?.rating?.toString()
          const position = result?.geometry?.location
          const photo = result?.photos ? result.photos[0].getUrl() : undefined

          changeGraph((graph) => {
            const placeNode = createRecordNode(graph, {
              id: placeId,
              name,
              props: [
                // { type: "image", url: photo } as ImageValue, todo: add back images
                ["rating", rating],
                ["address", address],
                ["phone", phone],
                ["website", website],
                ["position", position ? `${position.lat()}, ${position.lng()}` : undefined],
              ],
            })

            resolve(placeNode)
          })
        }
      )
    })
  })
}

function getMinBounds(points: google.maps.LatLngLiteral[]): google.maps.LatLngBounds {
  const bounds = new google.maps.LatLngBounds()
  for (const point of points) {
    bounds.extend(point)
  }

  return bounds
}

function writeBackMapState(graph: Graph, inputsNodeId: string, map: google.maps.Map) {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const latLongInputIndex = LatLongProperty.getChildIndexesOfNode(graph, inputsNodeId)[0]
  const zoomInputIndex = ZoomProperty.getChildIndexesOfNode(graph, inputsNodeId)[0]
  const inputNode = getNode(graph, inputsNodeId)

  const latLongValue = `position: ${center!.lat()}, ${center!.lng()}`

  if (latLongInputIndex !== undefined) {
    getNode(graph, inputNode.children[latLongInputIndex]).value = latLongValue
  } else {
    const latLngPropertyNode: ValueNode = {
      id: v4(),
      type: "value",
      value: latLongValue,
      children: [],
      isCollapsed: false,
      isSelected: false,
    }

    graph[latLngPropertyNode.id] = latLngPropertyNode
    inputNode.children.push(latLngPropertyNode.id)
  }

  const zoomValue = `zoom: ${zoom}`

  if (zoomInputIndex !== undefined) {
    const zoomPropertyNode = getNode(graph, inputNode.children[zoomInputIndex])
    if (zoomPropertyNode.value !== zoomValue) {
      zoomPropertyNode.value = zoomValue
    }
  } else {
    const zoomPropertyNode: ValueNode = {
      id: v4(),
      type: "value",
      value: zoomValue,
      children: [],
      isCollapsed: false,
      isSelected: false,
    }

    graph[zoomPropertyNode.id] = zoomPropertyNode
    inputNode.children.push(zoomPropertyNode.id)
  }
}
