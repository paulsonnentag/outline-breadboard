import { FunctionDefs } from "./function-def"
import { Parameter } from "../function-suggestions"

// @ts-ignore
const AIRLABS_API_KEY = __APP_ENV__.AIRLABS_API_KEY

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
    summaryView: (value) => (value ? getFlightStatusSummary(value) : ""),
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

      console.log({ flightNumber })

      if (namedArgs.of) {
        return flightNumber ? await getFlightStatus(flightNumber) : undefined
      }
    },
  },
}

export const getFlightStatus = async (flightNumber: string): Promise<FlightStatus | undefined> => {
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
  const depTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(status.dep_time))
  const arrTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(status.arr_time))
  return `${status.status} | ${status.dep_iata} @ ${depTime} ✈️ ${status.arr_iata} @ ${arrTime}`
}
