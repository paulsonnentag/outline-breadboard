import { FunctionDefs, HAS_MISSING_ARGUMENTS_VALUE } from "./function-def"

import { Parameter } from "../function-suggestions"
import { Flight } from "../../flights"
import { AIRLABS_API_KEY } from "../../api-keys"

type FlightStatus = {
  // TODO: show current airplane position on map.....?
  lat: number
  lng: number
  airline_iata: string
  airline_icao: string
  flight_iata: string
  flight_icao: string
  flight_number: string
  dep_iata: string
  dep_icao: string
  dep_time: string
  arr_iata: string
  arr_icao: string
  arr_time: string
  status: "scheduled" | "en-route" | "landed"
  delayed: number
}

export const FLIGHT_STATUS_FN: FunctionDefs = {
  FlightStatus: {
    icon: "flight_takeoff",
    suggestions: (parameters: Parameter[]) => {
      // TODO: implement suggestions
      return []
    },
    summaryView: (value) => getFlightStatusSummary(value),
    autocomplete: {
      icon: "flight_takeoff",
      name: "FlightStatus",
      arguments: [
        {
          label: "of",
        },
      ],
    },
    function: async ([node], namedArgs, scope) => {
      const flightNumber = namedArgs.of
        ? await namedArgs.of.getPropertyAsync("flightNumber")
        : undefined

      if (namedArgs.of) {
        return flightNumber ? await getFlightStatus(flightNumber) : undefined
      }
    },
  },
}

const getFlightStatus = async (flightNumber: string): Promise<FlightStatus | undefined> => {
  const response = await fetch(
    [
      "https://airlabs.co/api/v9/flight",
      `?api_key=${AIRLABS_API_KEY}`,
      `&flight_iata=${flightNumber}`,
    ].join("")
  ).then((response) => response.json())
  if (response.error) {
    return undefined
  }
  return response.response
}

const getFlightStatusSummary = (status: FlightStatus): string => {
  return status.status
}
