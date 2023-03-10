import { NodeViewProps } from "./index"
import { GOOGLE_MAPS_API_KEY } from "../api-keys"

import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useId, useRef, useState } from "react"
import {
  createRecordNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  ImageValue,
  useGraph,
  ValueNode,
} from "../graph"
import { NodeData, Property, readChildrenWithProperties } from "../property"
import classNames from "classnames"
import { v4 } from "uuid"
import { useStaticCallback } from "../hooks"
import { OutlineEditor } from "../OutlineEditor"
import { createRoot } from "react-dom/client"
import debounce from "lodash.debounce"
import LatLngLiteral = google.maps.LatLngLiteral
import LatLngBounds = google.maps.LatLngBounds

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

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  version: "beta",
  libraries: ["places", "marker"],
})

const googleApi = loader.load()

export function useGoogleApi(): typeof google | undefined {
  const [api, setApi] = useState<typeof google>()

  useEffect(() => {
    googleApi.then((google) => {
      setApi(google)
    })
  }, [])

  return api
}

const LAT_LONG_REGEX = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/

export const InputProperty = new Property("input", () => {
  return true
})

export const LatLongProperty = new Property<google.maps.LatLngLiteral>("position", (value) => {
  const match = value.match(LAT_LONG_REGEX)

  if (!match) {
    return
  }

  const [, rawLat, rawLng] = match
  const lat = parseFloat(rawLat)
  const lng = parseFloat(rawLng)

  if (isNaN(lat) || isNaN(lng)) {
    return
  }

  return { lat, lng }
})

const ZoomProperty = new Property<number>("zoom", (value) => {
  const parsedValue = parseInt(value, 10)

  return isNaN(parsedValue) ? undefined : parsedValue
})

const ColorProperty = new Property<string>("color", (value) => value.trim())

export function MapNodeView({ node, onOpenNodeInNewPane }: NodeViewProps) {
  const graphContext = useGraph()
  const { graph, changeGraph } = graphContext

  const indexOfInput = InputProperty.getChildIndexesOfNode(graph, node.id)[0]
  const inputsNodeId = node.children[indexOfInput]

  const childNodesWithLatLng = readChildrenWithProperties(graph, inputsNodeId, [LatLongProperty])
  const zoom = ZoomProperty.readValueOfNode(graph, inputsNodeId)[0]
  const center: google.maps.LatLngLiteral = LatLongProperty.readValueOfNode(graph, inputsNodeId)[0]

  const google = useGoogleApi()
  const mapId = useId()
  const mapRef = useRef<google.maps.Map>()
  const mapElementRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerView[]>([])
  const popOverRef = useRef<PopoverOutline>()
  const listenersRef = useRef<google.maps.MapsEventListener[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const minBounds =
    google &&
    getMinBounds(
      childNodesWithLatLng.map((child) => child.data.position[0] as google.maps.LatLngLiteral)
    )

  if (indexOfInput === undefined) {
    console.log("No map inputs")
    return <></>
  }

  // mount map

  useEffect(() => {
    const currentMapElement = mapElementRef.current
    if (!currentMapElement || !google) {
      return
    }

    const currentMap = (mapRef.current = new google.maps.Map(currentMapElement, {
      mapId,
      zoom: 11,
      center,
      disableDefaultUI: true,
      gestureHandling: "greedy",
    }))

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

        writeBackMapState(graph, inputsNodeId, mapRef.current)
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
        writeBackMapState(graph, inputsNodeId, currentMap)
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

    // todo: hacky, we don't mutate the graph here, we just use the mutation function to reference the new update graph
    // the graph in the current scope contains still the old data
    changeGraph((graph) => {
      const position = LatLongProperty.readValueOfNode(graph, placeId)[0]

      currentPopOver.position = position
      currentPopOver.rootId = placeId
      currentPopOver.show()
      currentPopOver.draw()
      currentPopOver.render({ graphContext, onOpenNodeInNewPane })
    })
  })

  // update bounds and zoom level if underlying data changes

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !google || childNodesWithLatLng.length === 0 || isDragging || isPanning) {
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
  }, [childNodesWithLatLng, google, isDragging, isPanning])

  // render markers on map

  useEffect(() => {
    if (!mapRef.current || !google) {
      return
    }

    const totalMarkers = childNodesWithLatLng.length

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

    for (let i = 0; i < childNodesWithLatLng.length; i++) {
      const childNodeWithLatLng: NodeData = childNodesWithLatLng[i]
      const latLng = new google.maps.LatLng(
        (childNodeWithLatLng.data.position as google.maps.LatLngLiteral[])[0]
      )

      const color = ColorProperty.readValueOfNode(graph, childNodeWithLatLng.id)[0] ?? "blue"

      let mapsMarker = prevMarkers[i] // reuse existing markers, if it already exists

      if (!mapsMarker) {
        const element = document.createElement("div")

        mapsMarker = new google.maps.marker.AdvancedMarkerView({
          map: mapRef.current,
          content: element,
          position: latLng,
        })

        prevMarkers.push(mapsMarker)
      }

      const markerContent = mapsMarker.content as HTMLDivElement

      markerContent.className = classNames(
        `w-[16px] h-[16px] rounded-full cursor-pointer border bg-${color}-500 border-${color}-700`
        // hoveredItemId === poiResult.id ? "bg-lime-500 border-lime-700" : "bg-red-500 border-red-700"
      )

      markerContent.style.transform = `translate(0, 8px)`

      listenersRef.current.push(
        mapsMarker.addListener("click", () => {
          changeGraph((graph) => {
            const node = getNode(graph, childNodeWithLatLng.id)

            node.isCollapsed = false
          })

          if (popOverRef.current) {
            popOverRef.current.position = latLng.toJSON()
            popOverRef.current.rootId = childNodeWithLatLng.id
            popOverRef.current.show()
            popOverRef.current.draw()
            popOverRef.current.render({ graphContext, onOpenNodeInNewPane })
          }

          mapRef.current?.panTo(latLng)
          mapRef.current?.setZoom(15)
        })
      )

      /*
      markerContent.className = `w-[16px] h-[16px] rounded-full shadow cursor-pointer ${
        geoMarker.entity.data.isHovered ? "bg-red-500" : "bg-blue-500"
      }`
      markerContent.onmouseenter = () => {
        geoMarker.entity.replace("isHovered", true)
      }
      markerContent.onmouseleave = () => {
        geoMarker.entity.retract("isHovered")
      }

      listenersRef.current.push(mapsMarker.addListener("mouseenter", () => {
        console.log("enter")
        setHoveredItemId(poiResult.id)
      }))
      listenersRef.current.push(mapsMarker.addListener("mouseleave", () => {
        setHoveredItemId(undefined)
      }))*/

      mapsMarker.position = latLng
      // mapsMarker.zIndex = hoveredItemId === poiResult.id ? 10 : 0
    }
  }, [childNodesWithLatLng, mapRef.current])

  useEffect(() => {
    if (popOverRef.current) {
      popOverRef.current.render({ graphContext, onOpenNodeInNewPane })
    }
  }, [Math.random()])

  const onFitBounds = () => {
    if (childNodesWithLatLng.length === 0) {
      return
    }

    const currentMap = mapRef.current

    if (!currentMap || !google) {
      return
    }

    currentMap.fitBounds(minBounds, 25)

    if (childNodesWithLatLng.length === 1) {
      currentMap.setZoom(11)
    }
  }

  return (
    <div className="w-full h-[400px] border border-gray-200 relative">
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
      {childNodesWithLatLng.length > 0 && (
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

  return (
    <GraphContext.Provider value={graphContext}>
      <OutlineEditor
        nodeId={rootId}
        index={0}
        path={[]}
        parentIds={[]}
        selectedPath={selectedPath}
        onChangeSelectedPath={setSelectedPath}
        onOpenNodeInNewPane={onOpenNodeInNewPane}
        onReplaceNode={() => {}} // it's not possible to replace the root nodeId in the pop over
      />
    </GraphContext.Provider>
  )
}

const asyncPlacesService = googleApi.then(
  (google) => new google.maps.places.PlacesService(document.createElement("div"))
)

export async function createPlaceNode(
  changeGraph: (fn: (graph: Graph) => void) => void,
  placeId: string
): Promise<ValueNode> {
  return new Promise((resolve) => {
    asyncPlacesService.then((placesService) => {
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
                { type: "image", url: photo } as ImageValue,
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

function getMinBounds(points: LatLngLiteral[]): LatLngBounds {
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
    }

    graph[zoomPropertyNode.id] = zoomPropertyNode
    inputNode.children.push(zoomPropertyNode.id)
  }
}
