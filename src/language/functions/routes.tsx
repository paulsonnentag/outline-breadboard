import { googleApi } from "../../google"
import { formatDistance, formatDuration } from "../../utils"
import { parseLatLng } from "../../properties"
import { getGraphDocHandle } from "../../graph"
import { DataWithProvenance, Scope } from "../scopes"
import { FunctionDefs } from "./function-def"
import { FunctionSuggestion, Parameter } from "../function-suggestions"

export const ROUTE_FN: FunctionDefs = {
  Drive: {
    icon: "directions_car",
    summaryView: (value) => (value ? `🚗 ${value.duration}, ${value.distance}` : `🚗`),
    autocomplete: {
      icon: "directions_car",
      name: "Drive",
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

    suggestions: suggestionsFn("Drive", "directions_car"),

    function: functionFn("Drive", "drive", "DRIVING" as any),
  },
  Bike: {
    icon: "directions_bike",
    summaryView: (value) => (value ? `🚴‍♀️ ${value.duration}, ${value.distance}` : `🚴‍♀️`),
    autocomplete: {
      icon: "directions_bike",
      name: "Bike",
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

    suggestions: suggestionsFn("Bike", "directions_bike"),

    function: functionFn("Bike", "bike", "BICYCLING" as any),
  },
  Walk: {
    icon: "directions_walk",
    summaryView: (value) => (value ? `🚶‍♀️ ${value.duration}, ${value.distance}` : `🚶‍♀️`),
    autocomplete: {
      icon: "directions_walk",
      name: "Walk",
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

    suggestions: suggestionsFn("Walk", "directions_walk"),

    function: functionFn("Walk", "walk", "WALKING" as any),
  },
}

function suggestionsFn(name: string, icon: string) {
  return (parameters: Parameter[]) => {
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
            icon: icon,
            name: name,
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
  }
}

function functionFn(
  name: string,
  resultsLabel: string,
  mode: google.maps.TravelMode
): (positionalArgs: any[], namedArgs: { [name: string]: any }, scope: Scope) => any {
  return async ([], { from, to, unit }, scope) => {
    if (!unit) {
      unit = (await scope.lookupValueAsync("lengthUnit")) ?? "kilometers"
    }

    if (from && to) {
      const fromPos = parseLatLng(await (from as Scope).getPropertyAsync("position"))
      const toPos = parseLatLng(await (to as Scope).getPropertyAsync("position"))

      if (!fromPos || !toPos) {
        return undefined
      }

      return getRouteInformation(fromPos, toPos, mode, unit)
    }

    let prevPositions: DataWithProvenance<google.maps.LatLngLiteral>[] = []

    const positions: DataWithProvenance<google.maps.LatLngLiteral>[][] = []
    const inBetweenLocations: DataWithProvenance<number>[] = []

    for (const childScope of scope.childScopes) {
      const currentPositions: DataWithProvenance<google.maps.LatLngLiteral>[] =
        await childScope.getOwnPropertyAndPropertiesOfTransclusionAsync("position", parseLatLng)

      for (const prevPosition of prevPositions) {
        for (const currentPosition of currentPositions) {
          childScope.setProperty(
            resultsLabel,
            `{${name}(from: #[${prevPosition.scope.id}], to: #[${currentPosition.scope.id}])}`
          )
        }
      }

      if (currentPositions.length === 0) {
        const containedLocations = await childScope.extractDataInScopeAsync(
          async (scope) => {
            if (scope.source.startsWith(`${resultsLabel}:`)) {
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
        resultsLabel,

        `{${name}(from: #[${prevPosition.scope.id}], to:${inBetweenLocation.scope.source})} {${name}(from: ${inBetweenLocation.scope.source}, to: #[${nextPosition.scope.id}])}`

        // `${prevPosition.scope.source} -> ${curr}`
        //`{Route(from: #[${prevPosition.scope.id}], to: #[${inBetweenLocation.scope.id}])} {Route(from: #[${inBetweenLocation.scope.id}], to: ${nextPosition.scope.id}])}`
      )
    }
  }
}

async function getRouteInformation(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
  mode: google.maps.TravelMode,
  unit: string
): Promise<RouteInformation | undefined> {
  const graphDocHandle = getGraphDocHandle()
  const doc = await graphDocHandle.value()

  const key = JSON.stringify({ from, to, mode })
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
        travelMode: mode,
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
