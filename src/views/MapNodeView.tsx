import { NodeViewProps } from "./index"
import { GOOGLE_MAPS_API_KEY } from "../api-keys"

import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  createRecordNode,
  getNode,
  Graph,
  GraphContext,
  GraphContextProps,
  useGraph,
  ValueNode,
} from "../graph"
import { NodeData, Property, readChildrenWithProperties } from "../property"
import classNames from "classnames"
import { v4 } from "uuid"
import { useStaticCallback } from "../hooks"
import debounce from "lodash.debounce"
import { OutlineEditor } from "../OutlineEditor"
import { createRoot } from "react-dom/client"

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  version: "beta",
  libraries: ["places", "marker"],
})

const googleApi = loader.load()

function useGoogleApi() {
  const [api, setApi] = useState<typeof google>()

  useEffect(() => {
    googleApi.then((google) => {
      setApi(google)
    })
  }, [])

  return api
}

const LAT_LONG_REGEX = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/

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

export function MapNodeView({ node, innerRef }: NodeViewProps) {
  const graphContext = useGraph()
  const { graph, changeGraph } = graphContext

  const google = useGoogleApi()
  const mapId = useId()
  const mapRef = useRef<google.maps.Map>()
  const markersRef = useRef<google.maps.marker.AdvancedMarkerView[]>([])
  const popOverRef = useRef<PopoverOutline>()
  const listenersRef = useRef<google.maps.MapsEventListener[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const childNodesWithLatLng = readChildrenWithProperties(graph, node.id, [LatLongProperty])
  const zoom = ZoomProperty.readValueOfNode(graph, node.id)[0]
  const center: google.maps.LatLngLiteral = LatLongProperty.readValueOfNode(graph, node.id)[0]
  const placesService = useMemo(() => {
    return google ? new google.maps.places.PlacesService(document.createElement("div")) : undefined
  }, [google])

  // mount map

  useEffect(() => {
    const currentContainer = innerRef.current
    if (!currentContainer || !google) {
      return
    }

    const currentMap = (mapRef.current = new google.maps.Map(currentContainer, {
      mapId,
      zoom: 11,
      center,
      //center: { lat: 50.775555, lng: 6.083611 },
      disableDefaultUI: true,
      gestureHandling: "greedy",
    }))

    const popup = (popOverRef.current = createPopoverOutline())

    popup.setMap(currentMap)
    popup.hide()

    const centerChangedListener = currentMap.addListener("center_changed", onChangeMapView)
    const zoomChangedListener = currentMap.addListener("zoom_changed", onChangeMapView)
    const clickListener = currentMap.addListener("click", onClickMap)

    markersRef.current = []
    listenersRef.current.forEach((listener) => listener.remove())
    listenersRef.current = []

    return () => {
      centerChangedListener.remove()
      zoomChangedListener.remove()
      clickListener.remove()
    }
  }, [innerRef.current])

  const onChangeMapView = useStaticCallback(
    debounce(() => {
      const currentMap = mapRef.current

      if (!currentMap) {
        return
      }

      const center = currentMap.getCenter()
      const zoom = currentMap.getZoom()

      const { id } = node

      const latLongChildIndex = LatLongProperty.getChildIndexesOfNode(graph, id)[0]
      const zoomChildIndex = ZoomProperty.getChildIndexesOfNode(graph, id)[0]

      changeGraph((graph) => {
        const node = getNode(graph, id)

        const latLongValue = `position: ${center!.lat()}, ${center!.lng()}`

        if (latLongChildIndex !== undefined) {
          getNode(graph, node.children[latLongChildIndex]).value = latLongValue
        } else {
          const latLngPropertyNode: ValueNode = {
            id: v4(),
            type: "value",
            value: latLongValue,
            children: [],
          }

          graph[latLngPropertyNode.id] = latLngPropertyNode
          node.children.push(latLngPropertyNode.id)
        }

        const zoomValue = `zoom: ${zoom}`

        if (zoomChildIndex !== undefined) {
          const zoomPropertyNode = getNode(graph, node.children[zoomChildIndex])
          if (zoomPropertyNode.value !== zoomValue) {
            zoomPropertyNode.value = zoomValue
          }
        } else {
          const zoomPropertyNode: ValueNode = {
            id: v4(),
            type: "value",
            value: zoomValue,
            children: [],
          }

          graph[zoomPropertyNode.id] = zoomPropertyNode
          node.children.push(zoomPropertyNode.id)
        }
      })
    })
  )

  const onClickMap = useStaticCallback((evt: any) => {
    const currentPopOver = popOverRef.current
    if (!currentPopOver || !placesService) {
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
      placesService?.getDetails(
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

          changeGraph((graph) => {
            const node = createRecordNode(graph, {
              id: placeId,
              name,
              props: {
                rating,
                address,
                phone,
                website,
                position: position ? `${position.lat()}, ${position.lng()}` : undefined,
              },
            })
          })

          currentPopOver.position = position?.toJSON()
          currentPopOver.rootId = placeId
          currentPopOver.show()
          currentPopOver.draw()
          currentPopOver.render(graphContext)

          if (position) {
            mapRef.current?.panTo(position)
          }
        }
      )
    } else {
      const position = LatLongProperty.readValueOfNode(graph, placeId)[0]

      currentPopOver.position = position
      currentPopOver.rootId = placeId
      currentPopOver.show()
      currentPopOver.draw()
      currentPopOver.render(graphContext)
      mapRef.current?.panTo(position)
    }
  })

  // update bounds and zoom level if underlying data changes

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !google || childNodesWithLatLng.length === 0 || isDragging) {
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

    // ... otherwise zoom to the bounds that include all points on the map

    const bounds = new google.maps.LatLngBounds()
    for (const childNode of childNodesWithLatLng) {
      const position: google.maps.LatLngLiteral = (
        childNode.data.position as google.maps.LatLngLiteral[]
      )[0]
      bounds.extend(position)
    }

    setTimeout(() => {
      currentMap.fitBounds(bounds, 25)

      if (childNodesWithLatLng.length === 1) {
        currentMap.setZoom(11)
      }
    }, 200) // todo: this is not very nice
    // but if we don't have this delay the zoom is not set correctly on initial load
  }, [childNodesWithLatLng, google, isDragging])

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
        `w-[16px] h-[16px] rounded-full cursor-pointer border bg-red-500 border-red-700`
        // hoveredItemId === poiResult.id ? "bg-lime-500 border-lime-700" : "bg-red-500 border-red-700"
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
      popOverRef.current.render(graphContext)
    }
  }, [Math.random()])

  return (
    <div
      draggable
      onDragStartCapture={(evt) => {
        evt.stopPropagation()
        evt.preventDefault()
        setIsDragging(true)
      }}
      onMouseUp={() => setIsDragging(false)}
      ref={innerRef as any}
      onDragStart={(evt) => evt.stopPropagation()}
      className="w-full h-[400px] border border-gray-200"
    ></div>
  )
}

interface PopoverOutline {
  render: (graph: GraphContextProps) => void
  position?: google.maps.LatLngLiteral
  rootId: string | undefined
  hide: () => void
  show: () => void
  draw: () => void
  setMap: (map: google.maps.Map) => void
}

// we have to construct the class lazily, because the google maps library is loaded async
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

    render(graphContext: GraphContextProps) {
      if (!this.rootId) {
        return
      }

      this.root.render(<PopoverOutlineView graphContext={graphContext} rootId={this.rootId} />)
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
}

function PopoverOutlineView({ graphContext, rootId }: PopoverOutlineViewProps) {
  const [selectedPath, setSelectedPath] = useState<number[]>([])

  return (
    <GraphContext.Provider value={graphContext}>
      <OutlineEditor
        nodeId={rootId}
        index={0}
        path={[]}
        parentIds={[]}
        selectedPath={selectedPath}
        onChangeSelectedPath={setSelectedPath}
      />
    </GraphContext.Provider>
  )
}
