import { NodeViewProps } from "./index"
import { LatLongProperty } from "./MapNodeView"
import { createRecordNode, createValueNode, getNode, Graph, useGraph, ValueNode } from "../graph"
import { useEffect } from "react"
import { Property } from "../property"
import useDebounce from "../hooks"
import { isString } from "../utils"

export function WeatherAveragesNodeView({ node }: NodeViewProps) {
  const { graph, changeGraph } = useGraph()

  const nodeId = node.id
  const inputNode = getInputNode(graph, node.id)
  const location = inputNode ? LatLongProperty.readValueOfNode(graph, inputNode.id)[0] : undefined
  const debouncedLocation = useDebounce(location, 500)

  useEffect(() => {
    if (!location) {
      return
    }

    console.log("fetch weather")

    getYearlyWeatherAt(location.lat, location.lng).then((yearlyWeather: YearlyWeather) => {
      changeGraph((graph) => {
        const node = getNode(graph, nodeId)

        const indexOfOutput = outputProperty.getChildIndexesOfNode(graph, nodeId)[0]

        if (indexOfOutput !== undefined) {
          delete node.children[indexOfOutput]
        }

        const output = createValueNode(graph, { value: "output:" })
        output.view = "table"
        output.isCollapsed = true

        for (const normal of yearlyWeather.normals) {
          const child = createRecordNode(graph, {
            name: monthToName(normal.month),
            props: [
              ["high", normal.tempMax?.toString()],
              ["low", normal.tempMin?.toString()],
            ],
          })

          child.view = "table"
          child.isCollapsed = true

          output.children.push(child.id)
        }

        node.children.push(output.id)
      })
    })
  }, [debouncedLocation?.lat, debouncedLocation?.lng])

  return null
}

const outputProperty = new Property("output", () => {
  return true
})

function getInputNode(graph: Graph, nodeId: string): ValueNode | undefined {
  const node = getNode(graph, nodeId)

  for (const childId of node.children) {
    const childNode = getNode(graph, childId)

    if (isString(childNode.value) && childNode.value.startsWith("input:")) {
      return childNode
    }
  }

  return undefined
}

interface WeatherNormal {
  month: number
  tempMin?: number
  tempMax?: number
  totalPrecipation?: number
  averageWindSpeed?: number
  averagePressure?: number
  totalSunshine?: number // in hours
}

interface YearlyWeather {
  station: any
  distance: number
  normals: WeatherNormal[]
}

function getYearlyWeatherAt(lat: number, lng: number): Promise<YearlyWeather> {
  return fetch(`http://localhost:3000/weather/averages?lat=${lat}&lng=${lng}`).then(
    (res) => res.json() as Promise<YearlyWeather>
  )
}

function monthToName(month: number) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    month - 1
  ]
}
