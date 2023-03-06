import { NodeViewProps } from "./index"
import { GOOGLE_MAPS_API_KEY } from "../api-keys"

import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useId, useRef, useState } from "react"
import { useGraph } from "../graph"
import { NodeData, Property, readChildrenWithProperties } from "../property"
import classNames from "classnames"
import { v4 } from "uuid"
import { useStaticCallback } from "../hooks"
import debounce from "lodash.debounce"
import { list } from "postcss"

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

const LatLongProperty = new Property<google.maps.LatLngLiteral>("position", (value) => {
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
  const { graph, changeGraph } = useGraph()

  const google = useGoogleApi()
  const mapId = useId()
  const mapRef = useRef<google.maps.Map>()
  const markersRef = useRef<google.maps.marker.AdvancedMarkerView[]>([])
  const listenersRef = useRef<google.maps.MapsEventListener[]>([])
  const [isDragging, setIsDragging] = useState(false)

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
        const node = graph[id]

        const latLongValue = `position: ${center!.lat()}, ${center!.lng()}`

        if (latLongChildIndex !== undefined) {
          graph[node.children[latLongChildIndex]].value = latLongValue
        } else {
          const latLngPropertyNode = {
            id: v4(),
            value: latLongValue,
            children: [],
          }

          graph[latLngPropertyNode.id] = latLngPropertyNode
          node.children.push(latLngPropertyNode.id)
        }

        const zoomValue = `zoom: ${zoom}`

        if (zoomChildIndex !== undefined) {
          const zoomPropertyNode = graph[node.children[zoomChildIndex]]
          if (zoomPropertyNode.value !== zoomValue) {
            zoomPropertyNode.value = zoomValue
          }
        } else {
          const zoomPropertyNode = {
            id: v4(),
            value: zoomValue,
            children: [],
          }

          graph[zoomPropertyNode.id] = zoomPropertyNode
          node.children.push(zoomPropertyNode.id)
        }
      })
    })
  )

  // mount map

  useEffect(() => {
    const currentContainer = innerRef.current
    if (!currentContainer || !google) {
      return
    }

    const currentMap = (mapRef.current = new google.maps.Map(currentContainer, {
      mapId,
      zoom: 11,
      center: { lat: 50.775555, lng: 6.083611 },
      disableDefaultUI: true,
      gestureHandling: "greedy",
    }))

    const centerChangedListener = currentMap.addListener("center_changed", onChangeMapView)
    const zoomChangedListener = currentMap.addListener("zoom_changed", onChangeMapView)

    markersRef.current = []
    listenersRef.current.forEach((listener) => listener.remove())
    listenersRef.current = []

    return () => {
      centerChangedListener.remove()
      zoomChangedListener.remove()
    }
  }, [innerRef.current])

  const childNodesWithLatLng = readChildrenWithProperties(graph, node.id, [LatLongProperty])
  const zoom = ZoomProperty.readValueOfNode(graph, node.id)[0]
  const center: google.maps.LatLngLiteral = LatLongProperty.readValueOfNode(graph, node.id)[0]

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
      currentMap.fitBounds(bounds, 50)

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

  return (
    <div
      draggable
      onDragStartCapture={(evt) => {
        evt.stopPropagation()
        evt.preventDefault()
        setIsDragging(true)
      }}
      onMouseUp={() => setIsDragging(false)}
      ref={innerRef}
      onDragStart={(evt) => evt.stopPropagation()}
      className="w-full h-[400px] border border-gray-200"
    ></div>
  )
}
