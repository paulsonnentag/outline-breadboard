import { FunctionDefs } from "./function-def"
import { FunctionSuggestion, Parameter } from "../function-suggestions"
import { parseLatLng } from "../../properties"
import { Scope } from "../scopes"

export const PARKING_SPOTS_FN: FunctionDefs = {
  ParkingSpots: {
    icon: "local_parking",
    suggestions: (parameters: Parameter[]) => {
      const locations = parameters.filter((p) => p.value.type === "location")
      const suggestions: FunctionSuggestion[] = []

      for (const location of locations) {
        let rank = location.distance

        suggestions.push({
          icon: "local_parking",
          name: "ParkingSpots",
          arguments: [
            {
              label: "near",
              value: location.value.expression,
            },
          ],
          rank,
        })
      }

      return suggestions
    },
    summaryView: (value) => (value ? `${value.length} spots` : "loading"),
    autocomplete: {
      icon: "local_parking",
      name: "ParkingSpots",
      arguments: [
        {
          label: "near",
        },
      ],
    },
    function: async ([node], namedArgs, scope) => {
      const { near } = namedArgs

      if (!near) {
        return undefined
      }

      const position = parseLatLng(await (near as Scope).getPropertyAsync("position"))

      if (!position) {
        return undefined
      }

      const result = await getParkingSpots(position.lat, position.lng)

      console.log("parking spots")

      return result
    },
  },
}

const CACHE: { [key: string]: any } = {}

const RADIUS_IN_KM = 5

const getParkingSpots = async (lat: number, lng: number): Promise<any[]> => {
  const key = `${lat}:${lng}`

  if (CACHE[key]) {
    return CACHE[key]
  }

  const result = fetch(
    `https://api.val.town/v1/eval/@${encodeURIComponent(
      `paulsun.parkingSpots(${lat}, ${lng}, ${5})`
    )}`
  ).then((response) => response.json())

  CACHE[key] = result

  return result
}
