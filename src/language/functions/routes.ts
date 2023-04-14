import { FunctionDefs } from "./index"
import { googleApi } from "../../google"
import { last, round } from "../../utils"
import { parseLatLng } from "../../properties"
import { getGraphDocHandle } from "../../graph"
import { Scope } from "../dumb-scopes"

export const ROUTE_FN: FunctionDefs = {
  Route: {
    autocomplete: {
      label: "Route",
      value: "{Route(from:$ to:)}",
    },
    function: async ([stops], { from, to }) => {
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

      const graphDocHandle = getGraphDocHandle()
      const doc = await graphDocHandle.value()

      const key = JSON.stringify({ pos1, pos2, waypointPos })
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
            origin: pos1,
            destination: pos2,
            travelMode: google.maps.TravelMode.DRIVING,
            waypoints: waypoints.map((latLng) => ({
              location: latLng as google.maps.LatLngLiteral,
            })),
          },
          (result: google.maps.DirectionsResult | null) => {
            result = result ?? { routes: [] }

            graphDocHandle.change((graphDoc) => {
              graphDoc.cache[key] = JSON.stringify(result) // store it as string, because otherwise it takes a long time to write it into automerge
            })

            resolve(directionsResultToRoute(JSON.parse(JSON.stringify(result)))) // turn result into plain object, to keep behaviour consistent to when it's accessed from cache
          }
        )
      })
    },
  },
}

const directionsServiceApi = googleApi.then((google) => {
  return new google.maps.DirectionsService()
})

function directionsResultToRoute(result: google.maps.DirectionsResult) {
  const route: google.maps.DirectionsRoute = result.routes[0] // todo: just pick the first route for now

  if (!route) {
    return undefined
  }

  const duration = `${round(
    route.legs.reduce((sum, leg) => (leg.duration?.value ?? 0) + sum, 0) / 60 / 60
  )} h`
  const distance = `${round(
    route.legs.reduce((sum, leg) => (leg.distance?.value ?? 0) + sum, 0) / 1000
  )} km`
  const shortDuration = duration?.replace("hours", "h").replace("mins", "m")

  return {
    __summary: `${distance}, ${shortDuration}`,
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
