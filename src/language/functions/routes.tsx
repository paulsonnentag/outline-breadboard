import { googleApi } from "../../google"
import { formatDistance, formatDuration } from "../../utils"
import { parseLatLng } from "../../properties"
import { getGraphDocHandle } from "../../graph"
import { DataWithProvenance, Scope } from "../scopes"
import LatLngLiteral = google.maps.LatLngLiteral
import { FunctionDefs } from "./function-def"
import { FunctionSuggestion, Parameter } from "../function-suggestions"

export const ROUTE_FN: FunctionDefs = {
  Route: {
    icon: "route",
    summaryView: (value) => `🛣️ ${value.duration}`,
    autocomplete: {
      icon: "route",
      name: "Route",
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

    suggestions: (parameters: Parameter[]) => {
      const locations = parameters.filter((p) => p.value.type === "location")
      const suggestions: FunctionSuggestion[] = []

      for (const locationA of locations) {
        for (const locationB of locations) {
          if (locationA !== locationB) {
            let rank = locationA.distance + locationB.distance

            if (locationA.scope.isPrecedingSiblingOf(locationB.scope)) {
              rank -= 1
            }

            suggestions.push({
              icon: "route",
              name: "Route",
              arguments: [
                {
                  label: "from",
                  value: locationA.value.expression,
                },
                {
                  label: "to",
                  value: locationB.value.expression,
                },
              ],
              rank,
            })
          }
        }
      }

      return suggestions
    },
    function: async ([], { from, to, unit }, scope) => {
      if (!unit) {
        unit = (await scope.lookupValueAsync("lengthUnit")) ?? "kilometers"
      }

      if (from && to) {
        const fromPos = parseLatLng(await (from as Scope).getPropertyAsync("position"))
        const toPos = parseLatLng(await (to as Scope).getPropertyAsync("position"))

        if (!fromPos || !toPos) {
          return undefined
        }

        return getRouteInformation(fromPos, toPos, unit)
      }

      let prevPositions: DataWithProvenance<google.maps.LatLngLiteral>[] = []

      const positions: DataWithProvenance<LatLngLiteral>[][] = []
      const inBetweenLocations: DataWithProvenance<number>[] = []

      for (const childScope of scope.childScopes) {
        const currentPositions: DataWithProvenance<google.maps.LatLngLiteral>[] =
          await childScope.getOwnPropertyAndPropertiesOfTransclusionAsync("position", parseLatLng)

        for (const prevPosition of prevPositions) {
          for (const currentPosition of currentPositions) {
            childScope.setProperty(
              "route",
              `{Route(from: #[${prevPosition.scope.id}], to: #[${currentPosition.scope.id}])}`
            )
          }
        }

        if (currentPositions.length === 0) {
          const containedLocations = await childScope.extractDataInScopeAsync(
            async (scope) => {
              if (scope.source.startsWith("route:")) {
                return
              }

              const positions = await scope.getOwnPropertyAndPropertiesOfTransclusionAsync(
                "position",
                parseLatLng
              )
              // console.log("inside", positions)

              return positions
            },
            { skipTranscludedScopes: true }
          )

          for (const containedLocation of containedLocations) {
            inBetweenLocations.push({
              data: positions.length,
              scope: containedLocation.scope,
            })
          }
        } else {
          prevPositions = currentPositions
          positions.push(currentPositions)
        }
      }

      for (const inBetweenLocation of inBetweenLocations) {
        const prevPosition = positions[inBetweenLocation.data - 1][0]
        const nextPosition = positions[inBetweenLocation.data][0]

        if (!prevPosition || !nextPosition) {
          continue
        }

        inBetweenLocation.scope.setProperty(
          "route",

          `{Route(from: #[${prevPosition.scope.id}], to:${inBetweenLocation.scope.source})} {Route(from: ${inBetweenLocation.scope.source}, to: #[${nextPosition.scope.id}])}`

          // `${prevPosition.scope.source} -> ${curr}`
          //`{Route(from: #[${prevPosition.scope.id}], to: #[${inBetweenLocation.scope.id}])} {Route(from: #[${inBetweenLocation.scope.id}], to: ${nextPosition.scope.id}])}`
        )
      }
    },
  },
}

async function getRouteInformation(
  from: LatLngLiteral,
  to: LatLngLiteral,
  unit: string
): Promise<RouteInformation | undefined> {
  const graphDocHandle = getGraphDocHandle()
  const doc = await graphDocHandle.value()

  const key = JSON.stringify({ from, to })
  const cachedResult: google.maps.DirectionsResult = doc.cache[key]
    ? JSON.parse(doc.cache[key])
    : undefined

  if (cachedResult) {
    return directionsResultToRoute(cachedResult, unit)
  }

  const directionsService = await directionsServiceApi

  return new Promise((resolve) => {
    console.log("fetch route 💰")

    directionsService.route(
      {
        origin: from,
        destination: to,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result: google.maps.DirectionsResult | null) => {
        result = result ?? { routes: [] }

        graphDocHandle.change((graphDoc) => {
          graphDoc.cache[key] = JSON.stringify(result) // store it as string, because otherwise it takes a long time to write it into automerge
        })

        resolve(directionsResultToRoute(JSON.parse(JSON.stringify(result)), unit)) // turn result into plain object, to keep behaviour consistent to when it's accessed from cache
      }
    )
  })
}

interface RouteInformation {
  distance: string
  duration: string
  geoJson: object
}

const directionsServiceApi = googleApi.then((google) => {
  return new google.maps.DirectionsService()
})

function directionsResultToRoute(
  result: google.maps.DirectionsResult,
  distanceUnit: string
): RouteInformation | undefined {
  const route: google.maps.DirectionsRoute = result.routes[0] // todo: just pick the first route for now

  if (!route) {
    return undefined
  }

  const duration = formatDuration(
    route.legs.reduce((sum, leg) => (leg.duration?.value ?? 0) + sum, 0) * 1000
  )
  const distance = formatDistance(
    route.legs.reduce((sum, leg) => (leg.distance?.value ?? 0) + sum, 0) / 1000,
    distanceUnit
  )

  return {
    distance,
    duration,
    geoJson: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: route.overview_path.map(({ lat, lng }) => [lng, lat]),
      },
    },
  }
}
