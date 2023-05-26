import { Graph, ValueNode, createRecordNode } from "./graph"
import { getFlightStatus } from "./language/functions/flightStatus"

export type Flight = {
  flightNumber: string
  departure: string
  arrival: string
  departureTime: string
  arrivalTime: string
}

async function getFlightInfo(flightNumber: string) {
  const info = await getFlightStatus(flightNumber)
  return {
    flightNumber,
    departure: info?.dep_iata,
    arrival: info?.arr_iata,
    departureTime: new Date(info?.dep_time ?? 0).toLocaleTimeString(),
    arrivalTime: new Date(info?.arr_time ?? 0).toLocaleTimeString(),
  }
}

export async function createFlightNode(
  changeGraph: (fn: (graph: Graph) => void) => void,
  flightNumber: string
): Promise<ValueNode> {
  const flight = await getFlightInfo(flightNumber)
  let flightNode = undefined
  changeGraph((graph) => {
    flightNode = createRecordNode(graph, {
      id: `flight-${flightNumber}`,
      name: flightNumber,
      props: Object.entries(flight),
    })
  })
  return flightNode as unknown as ValueNode
}
