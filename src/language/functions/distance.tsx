import { FunctionDefs } from "./function-def"
import turfDistance from "@turf/distance"
import { point as turfPoint } from "@turf/helpers"
import { parseLatLng } from "../../properties"
import { Scope } from "../scopes"
import { FunctionSuggestion, Parameter } from "../function-suggestions"

export const DISTANCE_FN: FunctionDefs = {
  Distance: {
    icon: "straighten",
    suggestions: (parameters: Parameter[]) => {
      const locations = parameters.filter((p) => p.value.type === "location")
      const suggestions: FunctionSuggestion[] = []

      for (const locationA of locations) {
        for (const locationB of locations) {
          if (locationA !== locationB) {
            let rank = locationA.distance + locationB.distance + 0.5 // give distance disadvantage over route

            if (locationA.value.scope.isPrecedingSiblingOf(locationB.value.scope)) {
              rank -= 1
            }

            suggestions.push({
              icon: "straighten",
              name: "Distance",
              arguments: [
                {
                  label: "from",
                  expression: locationA.value.expression,
                  value: locationA.value.value,
                },
                {
                  label: "to",
                  expression: locationB.value.expression,
                  value: locationB.value.value,
                },
              ],
              rank,
            })
          }
        }
      }

      return suggestions
    },
    summaryView: (value) => `📏 ${Math.round(value.value)} ${unitShortName(value.unit)}`,
    autocomplete: {
      icon: "straighten",
      name: "Distance",
      arguments: [
        {
          label: "from",
        },
        {
          label: "to",
        },
      ],
    },

    parameters: {
      from: "location",
      to: "location",
    },

    function: async ([], { from, to, unit }, scope) => {
      if (!unit) {
        unit = (await scope.lookupValueAsync("lengthUnit")) ?? "kilometers"
      }

      if (from && to) {
        const pos1 =
          from && from.lat && from.lng
            ? from
            : parseLatLng(await (from as Scope).getPropertyAsync("position"))
        const pos2 =
          to && to.lat && to.lng
            ? to
            : parseLatLng(await (to as Scope).getPropertyAsync("position"))

        if (!pos1 || !pos2) {
          return undefined
        }

        const distance = turfDistance(
          turfPoint([pos1.lng, pos1.lat]),
          turfPoint([pos2.lng, pos2.lat]),
          {
            units: unit,
          }
        )

        return {
          value: distance,
          unit,
          geoJson: {
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

interface DistanceInformation {
  value: number
  unit: string
  geoJson: any
}

interface DistanceInfoViewProps {
  value: DistanceInformation
}
