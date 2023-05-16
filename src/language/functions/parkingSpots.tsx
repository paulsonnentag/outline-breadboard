import { FunctionDefs } from "./function-def"
import { FunctionSuggestion, Parameter } from "../function-suggestions"
import { parseLatLng } from "../../properties"
import { Scope } from "../scopes"
import LatLngLiteral = google.maps.LatLngLiteral
import {
  createRecordNode,
  getGraph,
  getGraphDocHandle,
  getLabelOfNode,
  Graph,
  ValueNode,
} from "../../graph"
import { placesServiceApi } from "../../google"
import { DragEvent } from "react"

export const PARKING_SPOTS_FN: FunctionDefs = {
  ParkingSpots: {
    icon: "local_parking",
    suggestions: (parameters: Parameter[]) => {
      const locations = parameters.filter((p) => p.value.type === "location")
      const suggestions: FunctionSuggestion[] = []

      for (const location of locations) {
        let rank = location.distance

        suggestions.push({
          icon: "local_parking",
          name: "ParkingSpots",
          arguments: [
            {
              label: "near",
              value: location.value.expression,
            },
          ],
          rank,
        })
      }

      return suggestions
    },
    summaryView: (value) => `🅿️ ${value.length} spots`,
    expandedView: (parkingSpots) => {
      if (!parkingSpots) {
        return null
      }

      const onDragStart = (evt: DragEvent, item: ParkingSpot) => {
        evt.stopPropagation()
        var elem = document.createElement("div")
        elem.style.position = "absolute"
        elem.className = "bg-white border border-gray-200 px-2 py-1 rounded flex gap-2"
        elem.style.top = "-1000px"
        elem.innerText = item.title
        document.body.appendChild(elem)

        setTimeout(() => {
          elem.remove()
        })

        evt.dataTransfer.effectAllowed = "move"
        evt.dataTransfer.setDragImage(elem, -10, -10)
        evt.dataTransfer.setData(
          "application/node",
          JSON.stringify({
            type: "create",
            nodeId: item.id,
          })
        )
      }

      return (
        <div>
          {parkingSpots.map((parkingSpot: any) => (
            <div className="flex" draggable onDragStart={(evt) => onDragStart(evt, parkingSpot)}>
              <div className="bullet"></div>
              {parkingSpot.title}
            </div>
          ))}
        </div>
      )
    },
    autocomplete: {
      icon: "local_parking",
      name: "ParkingSpots",
      arguments: [
        {
          label: "near",
        },
      ],
    },
    function: async ([node], namedArgs, scope) => {
      const { near } = namedArgs

      if (!near) {
        return undefined
      }

      const position = parseLatLng(await (near as Scope).getPropertyAsync("position"))

      if (!position) {
        return undefined
      }

      const result = await getParkingSpots(position.lat, position.lng)

      return result
    },
  },
}

const RADIUS_IN_KM = 200
const LIMIT = 10

interface ParkingSpot {
  id: string
  title: string
  description: string
  images: {
    url: string
    thumb: string
  }[]
  rating: number
  position: LatLngLiteral
  address: { city: string; country: string; street: string; zipcode: string }
  type: string
}

const PARKING_SPOT_RESULTS_CACHE: { [key: string]: any } = {}

const PARKING_SPOT_CACHE: { [id: string]: ParkingSpot } = {}

const getParkingSpots = async (lat: number, lng: number): Promise<ParkingSpot[]> => {
  const key = `${lat}:${lng}`

  if (PARKING_SPOT_RESULTS_CACHE[key]) {
    return PARKING_SPOT_RESULTS_CACHE[key]
  }

  const result = fetch(
    `https://api.val.town/v1/eval/@${encodeURIComponent(
      `paulsun.parkingSpots(${lat}, ${lng}, ${RADIUS_IN_KM})`
    )}`
  )
    .then((response) => response.json())
    .then((spots) => {
      return Promise.all(
        spots
          .slice(0, LIMIT)
          .map(({ id, title_short, description, images, address, lat, lng, type, rating }: any) => {
            const parkingSpotId = `parking-spot-${id}`

            const parkingSpot: ParkingSpot = {
              id: parkingSpotId,
              title: title_short,
              description,
              images,
              address,
              position: { lat, lng },
              type: type.label,
              rating,
            }

            PARKING_SPOT_CACHE[parkingSpotId] = parkingSpot

            return parkingSpot
          })
      )
    })

  PARKING_SPOT_RESULTS_CACHE[key] = result

  return result
}

export function isParkingSpotId(id: string) {
  return id.startsWith(`parking-spot-`)
}

function getParkingSpotById(id: string) {
  return PARKING_SPOT_CACHE[id]
}

export async function createParkingSpotNode(
  changeGraph: (fn: (graph: Graph) => void) => void,
  parkingSpotId: string
): Promise<ValueNode> {
  return new Promise((resolve) => {
    const parkingSpot = getParkingSpotById(parkingSpotId)

    changeGraph((graph) => {
      const placeNode = createRecordNode(graph, {
        id: parkingSpotId,
        name: parkingSpot.title,
        props: [
          // { type: "image", url: photo } as ImageValue, todo: add back images
          [
            "image",
            parkingSpot.images.length > 0 ? `![${parkingSpot.images[0].thumb}]` : undefined,
          ],
          ["rating", parkingSpot.rating.toString()],
          [
            "address",
            `${parkingSpot.address.street}, ${parkingSpot.address.zipcode} ${parkingSpot.address.city}, ${parkingSpot.address.country}`,
          ],
          ["description", parkingSpot.description],
          ["position", `${parkingSpot.position.lat},${parkingSpot.position.lng}`],
        ],
      })

      resolve(placeNode)
    })
  })
}
