import { Loader } from "@googlemaps/js-api-loader"
import { GOOGLE_MAPS_API_KEY } from "./api-keys"
import { useEffect, useState } from "react"

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  version: "beta",
  libraries: ["places", "marker"],
})

export const googleApi = loader.load()

export const placesAutocompleteApi = googleApi.then(
  (google) => new google.maps.places.AutocompleteService()
)

export const placesServiceApi = googleApi.then(
  (google) => new google.maps.places.PlacesService(document.createElement("div"))
)

export function useGoogleApi(): typeof google | undefined {
  const [api, setApi] = useState<typeof google>()

  useEffect(() => {
    googleApi.then((google) => {
      setApi(google)
    })
  }, [])

  return api
}
