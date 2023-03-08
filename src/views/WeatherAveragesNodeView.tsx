import { NodeViewProps } from "./index"
import { LatLongProperty } from "./MapNodeView"
import { createNode, createRecordNode, getNode, Graph, useGraph, ValueNode } from "../graph"
import stations from "../data/stations.json"
import { parse } from "csv-parse/browser/esm"
import * as turf from "@turf/helpers"
import nearestPoint from "@turf/nearest-point"
import { useEffect } from "react"
import { Property } from "../property"

export function WeatherAveragesNodeView({ node }: NodeViewProps) {
  const { graph, changeGraph } = useGraph()

  const nodeId = node.id
  const inputNode = getInputNode(graph, node.id)
  const location = inputNode ? LatLongProperty.readValueOfNode(graph, inputNode.id)[0] : undefined

  useEffect(() => {
    if (!location) {
      return
    }

    getForecastItemAt(location.lat, location.lng).then((normals: any) => {
      changeGraph((graph) => {
        const node = getNode(graph, nodeId)

        const indexOfOutput = outputProperty.getChildIndexesOfNode(graph, nodeId)[0]

        if (indexOfOutput !== undefined) {
          delete node.children[indexOfOutput]
        }

        const output = createNode(graph, { value: "output:" })

        console.log(normals)

        for (let x = 0; x < normals.length; x++) {
          const normal = normals[x]

          output.children.push(
            createRecordNode(graph, {
              name: [
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ][x],
              props: {
                high: parseFloat(normal["MLY-TMAX-NORMAL"]).toString(),
                low: parseFloat(normal["MLY-TMIN-NORMAL"]).toString(),
              },
            }).id
          )
        }

        node.children.push(output.id)
      })
    })
  }, [location?.lat, location?.lng])

  return null
}

const outputProperty = new Property("output", () => {
  return true
})

function getInputNode(graph: Graph, nodeId: string): ValueNode | undefined {
  const node = getNode(graph, nodeId)

  for (const childId of node.children) {
    const childNode = getNode(graph, childId)

    if (childNode.value.startsWith("input:")) {
      return childNode
    }
  }

  return undefined
}

function getForecastItemAt(lat: number, long: number) {
  // const closestStationId = "AQW00061705" //getClosestStationId(lat, long)
  const closestStationId = getClosestStationId(lat, long)

  return fetch(
    `https://www.ncei.noaa.gov/data/normals-monthly/2006-2020/access/${closestStationId}.csv`
  )
    .then((res) => res.text())
    .then(
      (res) =>
        new Promise((resolve) => {
          parse(res, { columns: true }, (err, records) => resolve(records))
        })
    )
}

const stationPointsCollection = turf.featureCollection(
  stations.map((station) => {
    return turf.point([station.lat, station.long], { name: station.name })
  })
)

function getClosestStationId(lat: number, long: number) {
  const nearestStationPoint = nearestPoint(turf.point([lat, long]), stationPointsCollection)

  return nearestStationPoint.properties.name
}
