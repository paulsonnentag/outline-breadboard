import React, { useState } from "react"
import { NodeViewProps } from "."
import { useGraph } from "../graph"
import {
  DataWithProvenance,
  extractDataInNodeAndBelow,
  readDate,
} from "../properties"

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


interface CalendarProps {
  dates: DataWithProvenance<Date>[]
}

function CalendarGrid({ dates }: CalendarProps) {
  const sortedDates = dates
    .map((d) => d.data)
    .sort((a, b) => a.getTime() - b.getTime())

  const start = new Date(sortedDates[0].getFullYear(), sortedDates[0].getMonth(), 1)
  const end = new Date(sortedDates[sortedDates.length - 1].getFullYear(), sortedDates[sortedDates.length - 1].getMonth() + 1, 0)

  const weeks = getWeeks(start, end, sortedDates)

  return (
    <div className="rounded-lg overflow-hidden">
      <table className="w-full table-fixed">
        <thead>
          <tr className="text-gray-600 text-lg font-medium">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <th key={day} className="py-3 px-1">{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i} className="week">
              {week.map((date, j) => (
                <DateCell key={j} date={date} data={dates.find((d) => d.data.getTime() === date.getTime())} showMonth={(i == 0 && j == 0) || date.getDate() === 1} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface DateCellProps {
  date: Date
  data?: DataWithProvenance<Date>
  showMonth: boolean
}

function DateCell({ date, data, showMonth }: DateCellProps) {
  const isToday = isSameDay(date, new Date())
  const isHighlighted = false // todo
  const monthName = showMonth ? date.toLocaleString('default', { month: 'long' }) : null;

  return (
    <td className={`py-2 px-1 ${isToday ? 'bg-gray-100' : ''} ${isHighlighted ? 'bg-blue-500 text-white' : ''}`}>
      <div className="text-gray-600 font-medium">{date.getDate()} {monthName}</div>
      {data && <div className="text-sm text-gray-400">{data.nodeId}</div>}
    </td>
  )
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

function getWeeks(start: Date, end: Date, dates: Date[]): Date[][] {
  const weeks: Date[][] = []
  let curr = new Date(start)
  while (curr <= end) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(curr)
      curr = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}
