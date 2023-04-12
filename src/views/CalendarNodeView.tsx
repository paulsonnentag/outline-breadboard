import React, { useState } from "react"
import { NodeViewProps } from "."
import { useGraph } from "../graph"
import {
  DataWithProvenance,
  extractDataInNodeAndBelow,
  readDate,
} from "../properties"
import CalendarGrid from "./CalendarGrid"
import CalendarList from "./CalendarList"

export function CalendarNodeView({ node }: NodeViewProps) {
  const { graph } = useGraph()
  const [view, setView] = useState(0)

  const dates: DataWithProvenance<Date>[] = extractDataInNodeAndBelow(
    graph,
    node.id,
    (graph, node) => readDate(graph, node.id)
  )

  return (
    <div>
      <CalendarTabs view={view} setView={setView} />

      {view === 0 && 
        <CalendarGrid dates={dates} />
      }
      {view === 1 && 
        <CalendarList dates={dates} />
      }
    </div>
  )
}

interface CalendarTabsProps {
  view: number
  setView: React.Dispatch<React.SetStateAction<number>>
}

function CalendarTabs({ view, setView }: CalendarTabsProps) {
  return (
    <div className="border-b border-gray-200">
      <ul className="flex flex-wrap -mb-px text-sm font-medium text-center text-gray-500">
        <li className="mr-2">
          <a href="#" className={`inline-flex items-center p-4 border-b-2 group ${view === 0 ? 'border-blue-600 text-blue-600' : 'border-transparent'}`} onClick={() => setView(0)}>
            <span className="material-icons-outlined mr-1" style={{ fontSize: "16px" }}>calendar_view_month</span> Grid
          </a>
        </li>
        <li className="mr-2">
          <a href="#" className={`inline-flex items-center p-4 border-b-2 group ${view === 1 ? 'border-blue-600 text-blue-600' : 'border-transparent'}`} onClick={() => setView(1)}>
            <span className="material-icons-outlined mr-1" style={{ fontSize: "16px" }}>calendar_view_day</span> List
          </a>
        </li>
      </ul>
    </div>
  ) 
}
