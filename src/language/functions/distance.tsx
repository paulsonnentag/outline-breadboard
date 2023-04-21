import { FunctionDefs } from "./index"
import turfDistance from "@turf/distance"
import { point as turfPoint } from "@turf/helpers"
import { parseLatLng } from "../../properties"
import { last } from "../../utils"
import { DataWithProvenance, Scope } from "../scopes"

export const DISTANCE_FN: FunctionDefs = {
  Distance: {
    summaryView: ({ value }) => {
      return <DistanceInfoView value={value} />
    },
    autocomplete: {
      label: "Distance",
      value: "{Distance(from: $, to:)}",
    },
    function: async ([], { from, to, unit = "kilometers" }, scope) => {
      if (from && to) {
        const pos1 = parseLatLng(await (from as Scope).getPropertyAsync("position"))
        const pos2 = parseLatLng(await (to as Scope).getPropertyAsync("position"))

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

      let prevPositions: DataWithProvenance<google.maps.LatLngLiteral>[] = []
      for (const childScope of scope.childScopes) {
        const currentPositions: DataWithProvenance<google.maps.LatLngLiteral>[] =
          await childScope.getOwnPropertyAndPropertiesOfTransclusionAsync("position", parseLatLng)

        for (const prevPosition of prevPositions) {
          for (const currentPosition of currentPositions) {
            childScope.setProperty(
              "distance",
              `{Distance(from: #[${prevPosition.scope.id}], to: #[${currentPosition.scope.id}])}`
            )
          }
        }

        if (currentPositions.length !== 0) {
          prevPositions = currentPositions
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

function DistanceInfoView({ value }: DistanceInfoViewProps) {
  return (
    <span>
      {Math.round(value.value)} {unitShortName(value.unit)}
    </span>
  )
}
