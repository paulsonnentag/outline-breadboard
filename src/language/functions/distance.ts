import { readLatLng } from "../../properties"
import turfDistance from "@turf/distance"
import { point as turfPoint } from "@turf/helpers"
import { FunctionDefs } from "./index"

export const DISTANCE_FN: FunctionDefs = {
  Distance: {
    autocomplete: {
      label: "Distance",
      value: "{Distance(from:$ to:)}",
    },
    function: (graph, [], { from, to, unit = "kilometers" }) => {
      if (!from || !from.id || !to || !to.id) {
        return
      }

      const pos1 = readLatLng(graph, from.id)
      const pos2 = readLatLng(graph, to.id)

      if (!pos1 || !pos2) {
        return undefined
      }

      const distance = turfDistance(
        turfPoint([pos1.lat, pos1.lng]),
        turfPoint([pos2.lat, pos2.lng]),
        {
          units: unit,
        }
      )

      const formattedDistance = `${Math.round(distance)} ${unitShortName(unit)}`

      return {
        // this special summary property is used in the collapsed state
        __summary: formattedDistance,
        distance: formattedDistance,
        geometry: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [pos1.lng, pos1.lat],
              [pos2.lng, pos2.lat],
            ],
          },
        },
      }
    },
  },
}

function unitShortName(unit: string) {
  switch (unit) {
    case "meters":
      return "m"

    case "kilometers":
      return "km"

    case "miles":
      return "mi"
    default:
      return unit
  }
}
