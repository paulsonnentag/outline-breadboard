import { NodeViewProps } from "./index"
import { GOOGLE_MAPS_API_KEY } from "../api-keys"

import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Graph, useGraph } from "../graph"
import LatLngLiteral = google.maps.LatLngLiteral
import { NodeData, Property, readChildrenWithProperties } from "../property"
import classNames from "classnames"

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

const LatLongProperty = new Property<LatLngLiteral>("position", (value) => {
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

export function MapNodeView({ node, innerRef }: NodeViewProps) {
  const { graph } = useGraph()

  const google = useGoogleApi()
  const mapId = useId()
  const mapRef = useRef<google.maps.Map>()
  const markersRef = useRef<google.maps.marker.AdvancedMarkerView[]>([])
  const listenersRef = useRef<google.maps.MapsEventListener[]>([])

  useEffect(() => {
    const currentContainer = innerRef.current
    if (!currentContainer || !google) {
      return
    }

    mapRef.current = new google.maps.Map(currentContainer, {
      mapId,
      zoom: 11,
      disableDefaultUI: true,
      gestureHandling: "node",
    })
  }, [innerRef.current])

  const childNodesWithLatLng = readChildrenWithProperties(graph, node.id, [LatLongProperty])

  // adapt view to contain all points
  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !google || childNodesWithLatLng.length === 0) {
      return
    }

    const bounds = new google.maps.LatLngBounds()
    for (const childNode of childNodesWithLatLng) {
      const position: LatLngLiteral = (childNode.data.position as LatLngLiteral[])[0]
      bounds.extend(position)
    }

    setTimeout(() => {
      currentMap.fitBounds(bounds, 50)

      if (childNodesWithLatLng.length === 1) {
        currentMap.setZoom(11)
      }
    }, 200) // todo: hacky
  }, [childNodesWithLatLng, google])

  // render nodes
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
        (childNodeWithLatLng.data.position as LatLngLiteral[])[0]
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
      ref={innerRef}
      onDrag={(evt) => evt.stopPropagation()}
      onDragStartCapture={(evt) => evt.stopPropagation()}
      className="w-full h-[400px] border border-gray-200"
    ></div>
  )
}
