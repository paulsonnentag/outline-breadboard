import { FunctionDefs } from "./index"
import turfDistance from "@turf/distance"
import { point as turfPoint } from "@turf/helpers"
import { getPropertyOfNode } from "../scopes"
import { parseLatLng } from "../../properties"

export const DISTANCE_FN: FunctionDefs = {
  Distance: {
    autocomplete: {
      label: "Distance",
      value: "{Distance(from:$ to:)}",
    },
    function: async ([], { from, to, unit = "kilometers" }, parentNodeIds, nodeId) => {
      if (!from || !from.id || !to || !to.id) {
        return
      }

      const pos1 = parseLatLng(await getPropertyOfNode(parentNodeIds, from.id, "position"))
      const pos2 = parseLatLng(await getPropertyOfNode(parentNodeIds, to.id, "position"))

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
