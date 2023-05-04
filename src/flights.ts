import { Graph, ValueNode, createRecordNode } from "./graph"

export type Flight = {
  flightNumber: string
  departure: string
  arrival: string
}

async function getFlightInfo(flightNumber: string) {
  return {
    flightNumber,
    departure: "LAX",
    arrival: "JFK",
  }
}

export async function createFlightNode(
  changeGraph: (fn: (graph: Graph) => void) => void,
  flightNumber: string
): Promise<ValueNode> {
  const flight = await getFlightInfo(flightNumber)
  let placeNode = undefined
  changeGraph((graph) => {
    placeNode = createRecordNode(graph, {
      id: `flight-${flightNumber}`,
      name: flightNumber,
      props: Object.entries(flight),
    })
  })
  return placeNode as unknown as ValueNode
}
