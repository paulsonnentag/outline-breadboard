import { Loader } from "@googlemaps/js-api-loader"
import { useEffect, useState } from "react"

// @ts-ignore
const API_KEY = __APP_ENV__.GOOGLE_MAPS_API_KEY

const loader = new Loader({
  apiKey: API_KEY,
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
