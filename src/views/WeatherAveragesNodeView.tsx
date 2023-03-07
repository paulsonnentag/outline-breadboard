import { NodeViewProps } from "./index"
import { BulletNodeView } from "./BulletNodeView"
import { LatLongProperty } from "./MapNodeView"
import { getNode, Graph, useGraph, ValueNode } from "../graph"
import stations from "../data/stations.json"
import { parse } from "csv-parse/browser/esm"
import * as turf from "@turf/helpers"
import nearestPoint from "@turf/nearest-point"
import { useEffect } from "react"

export function WeatherAveragesNodeView(props: NodeViewProps) {
  const { graph } = useGraph()

  const { innerRef, node, onChangeValue, isFocused } = props

  // LatLongProperty.readValueOfNode()

  const inputNode = getInputNode(graph, node.id)

  const location = inputNode ? LatLongProperty.readValueOfNode(graph, inputNode.id)[0] : undefined

  useEffect(() => {
    if (!location) {
      return
    }

    getForecastItemAt(location.lat, location.lng).then((normals) => {
      console.log("normals", normals)
    })
  }, [location?.lat, location?.lng])

  return <BulletNodeView {...props} />
}

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
  const closestStationId = "GQC00914727" //getClosestStationId(lat, long)
  // const closestStationId = getClosestStationId(lat, long)

  return (
    fetch(`https://www.ncei.noaa.gov/data/normals-monthly/2006-2020/access/${closestStationId}.csv`)
      .then((res) => res.text())
      .then(
        (res) =>
          new Promise((resolve) => {
            parse(res, { columns: true }, (err, records) => resolve(records))
          })
      )

      // for documentation see https://open-meteo.com/en/docs

      .then((normals) => {
        return normals
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
