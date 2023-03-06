import { NodeViewProps } from "./index"
import { GOOGLE_MAPS_API_KEY } from "../api-keys"

import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useId, useRef, useState } from "react"
import LatLng = google.maps.LatLng

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

export function MapNodeView({ innerRef }: NodeViewProps) {
  const google = useGoogleApi()
  const mapId = useId()
  const mapRef = useRef<google.maps.Map>()

  useEffect(() => {
    const currentContainer = innerRef.current
    if (!currentContainer || !google) {
      return
    }

    const currentMap = (mapRef.current = new google.maps.Map(currentContainer, {
      mapId,

      zoom: 11,
      center: { lat: 49.86067, lng: -117.09574 },
      disableDefaultUI: true,
      gestureHandling: "node",
    }))
  }, [innerRef.current])

  return (
    <div
      ref={innerRef}
      onDrag={(evt) => evt.stopPropagation()}
      onDragStartCapture={(evt) => evt.stopPropagation()}
      className="w-full h-[400px] bg-white shadow-xl border border-gray-200 rounded"
    ></div>
  )
}
