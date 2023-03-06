import { NodeViewProps } from "./index"
import { GOOGLE_MAPS_API_KEY } from "../api-keys"

import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Graph, useGraph } from "../graph"
import LatLngLiteral = google.maps.LatLngLiteral
import { Property, readChildrenWithProperties } from "../property"

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  libraries: ["places"],
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

  return (
    <div
      ref={innerRef}
      onDrag={(evt) => evt.stopPropagation()}
      onDragStartCapture={(evt) => evt.stopPropagation()}
      className="w-full h-[400px] border border-gray-200"
    ></div>
  )
}
