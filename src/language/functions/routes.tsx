import { googleApi } from "../../google"
import { round } from "../../utils"
import { parseLatLng } from "../../properties"
import { getGraphDocHandle } from "../../graph"
import { DataWithProvenance, Scope } from "../scopes"
import LatLngLiteral = google.maps.LatLngLiteral
import humanizeDuration from "humanize-duration"
import { FunctionDefs } from "./function-def"

export const ROUTE_FN: FunctionDefs = {
  Route: {
    summaryView: (value) => `${value.duration}, ${value.distance}`,
    autocomplete: {
      label: "Route",
      value: "{Route(from: $, to:)}",
    },
    function: async ([], { from, to }, scope) => {
      if (from && to) {
        const fromPos = parseLatLng(await (from as Scope).getPropertyAsync("position"))
        const toPos = parseLatLng(await (to as Scope).getPropertyAsync("position"))

        if (!fromPos || !toPos) {
          return undefined
        }

        return getRouteInformation(fromPos, toPos)
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
          console.log("nothing", childScope.value)

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

      console.log(inBetweenLocations)

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
  to: LatLngLiteral
): Promise<RouteInformation | undefined> {
  const graphDocHandle = getGraphDocHandle()
  const doc = await graphDocHandle.value()

  const key = JSON.stringify({ from, to })
  const cachedResult: google.maps.DirectionsResult = doc.cache[key]
    ? JSON.parse(doc.cache[key])
    : undefined

  if (cachedResult) {
    return directionsResultToRoute(cachedResult)
  }

  const directionsService = await directionsServiceApi

  return new Promise((resolve) => {
    console.log("fetch route")

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

        directionsResultToRoute(JSON.parse(JSON.stringify(result))) // turn result into plain object, to keep behaviour consistent to when it's accessed from cache
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

const shortEnglishHumanizer = humanizeDuration.humanizer({
  language: "shortEn",
  languages: {
    shortEn: {
      y: () => "y",
      mo: () => "mo",
      w: () => "w",
      d: () => "d",
      h: () => "h",
      m: () => "m",
      s: () => "s",
      ms: () => "ms",
    },
  },
})

function directionsResultToRoute(
  result: google.maps.DirectionsResult
): RouteInformation | undefined {
  const route: google.maps.DirectionsRoute = result.routes[0] // todo: just pick the first route for now

  if (!route) {
    return undefined
  }

  const duration = shortEnglishHumanizer(
    route.legs.reduce((sum, leg) => (leg.duration?.value ?? 0) + sum, 0) * 1000,
    { largest: 2 }
  )
  const distance = `${round(
    route.legs.reduce((sum, leg) => (leg.distance?.value ?? 0) + sum, 0) / 1000
  )} km`

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
