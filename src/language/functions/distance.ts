import { FunctionDefs } from "./index"
import turfDistance from "@turf/distance"
import { point as turfPoint } from "@turf/helpers"
import { parseLatLng } from "../../properties"
import { last } from "../../utils"
import { Scope } from "../dumb-scopes"

export const DISTANCE_FN: FunctionDefs = {
  Distance: {
    autocomplete: {
      label: "Distance",
      value: "{Distance(from:$ to:)}",
    },
    function: async ([stops], { from, to, unit = "kilometers" }) => {
      let waypoints = stops ? [...stops] : []

      if (!from && waypoints[0]) {
        from = waypoints.shift()
      }

      if (!to && last(waypoints)) {
        to = waypoints.pop()
      }

      const pos1 = parseLatLng(await (from as Scope).getPropertyAsync("position"))
      const pos2 = parseLatLng(await (to as Scope).getPropertyAsync("position"))
      const waypointPos = await Promise.all(
        waypoints.map((waypoint: Scope) => waypoint.getProperty("position"))
      )

      if (!pos1 || !pos2 || waypointPos.some((pos) => !pos)) {
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
