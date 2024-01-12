import React, { useState } from "react"
import { NodeViewProps } from "."
import { useGraph } from "../graph"
import { DataWithProvenance } from "../language/scopes"
import CalendarGrid from "./CalendarGrid"
import CalendarList from "./CalendarList"
import { parseDate, parseTime, Time } from "../properties"
import CalendarCols from "./CalendarCols"
import { Scope } from "../language/scopes"
import CalendarBlocks from "./CalendarBlocks"
import { SHOW_MOCK_DATA_IN_CALENDAR } from "../config"

export function CalendarNodeView({
  node,
  scope,
  isHoveringOverId,
  setIsHoveringOverId,
}: NodeViewProps) {
  const { graph } = useGraph()
  const [view, setView] = useState(2)

  const bulletsWithDate: DataWithProvenance<DataWithProvenance<Date>>[] = scope.extractDataInScope(
    (scope) => {
      return scope.getOwnPropertyAndPropertiesOfTransclusion<Date>("date", parseDate)
    },
    { skipTranscludedScopes: true }
  )

  const dateScopesWithBullets: {
    [date: string]: {
      date: Date
      dateScope: Scope
      scopes: Scope[]
      times: {
        [time: string]: {
          time: Time
          scopes: Scope[]
        }
      }
    }
  } = {}

  bulletsWithDate.forEach((bulletWithDate) => {
    const referencedDate = bulletWithDate.data.data
    const key = referencedDate.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })

    let dateScope = dateScopesWithBullets[key]

    if (!dateScope) {
      dateScope = dateScopesWithBullets[key] = {
        date: referencedDate,
        scopes: [],
        dateScope: bulletWithDate.data.scope,
        times: {},
      }
    }
    dateScope.scopes.push(bulletWithDate.scope)
  })

  const bulletsWithTime: DataWithProvenance<DataWithProvenance<Time>>[] = scope.extractDataInScope(
    (scope) => {
      return scope.getOwnPropertyAndPropertiesOfTransclusion<Time>("time", parseTime)
    },
    { skipTranscludedScopes: true }
  )

  for (const bullet of bulletsWithTime) {
    const time = bullet.data.data
    const timeKey = `${time.hour.toString().padStart(2, "0")}:${time.minute
      .toString()
      .padEnd(2, "0")}`

    const dateStr = bullet.data.scope.lookupValue("date", true)
    const date = parseDate(dateStr)

    if (date) {
      let timeScope = dateScopesWithBullets[dateStr].times[timeKey]

      if (!timeScope) {
        timeScope = dateScopesWithBullets[dateStr].times[timeKey] = {
          time,
          scopes: [],
        }
      }

      timeScope.scopes.push(bullet.scope)
    }
  }

  Object.values(dateScopesWithBullets).forEach((dateScopes) => {
    dateScopes.scopes = [dateScopes.dateScope].concat(
      dateScopes.scopes.filter((scope) =>
        dateScopes.scopes.every(
          (otherScope) => otherScope.id == scope.id || !scope.isInScope(otherScope.id)
        )
      )
    )
  })

  return (
    <div>
      <CalendarTabs view={view} setView={setView} />

      {view === 1 && (
        <CalendarList
          dates={Object.values(dateScopesWithBullets)}
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      )}
      {view === 2 && (
        <CalendarBlocks
          dates={Object.values(dateScopesWithBullets)}
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      )}
      {view === 3 && (
        <CalendarCols
          dates={Object.values(dateScopesWithBullets)}
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      )}
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
        {false && (
          <li className="mr-2">
            <a
              href="#"
              className={`inline-flex items-center p-4 border-b-2 group ${
                view === 0 ? "border-blue-600 text-blue-600" : "border-transparent"
              }`}
              onClick={() => setView(0)}
            >
              <span className="material-icons-outlined mr-1" style={{ fontSize: "16px" }}>
                calendar_view_month
              </span>{" "}
              Grid
            </a>
          </li>
        )}
        <li className="mr-2">
          <a
            href="#"
            className={`inline-flex items-center p-4 border-b-2 group ${
              view === 2 ? "border-blue-600 text-blue-600" : "border-transparent"
            }`}
            onClick={() => setView(2)}
          >
            <span className="material-icons-outlined mr-1" style={{ fontSize: "16px" }}>
              view_timeline
            </span>{" "}
            Blocks
          </a>
        </li>
        <li className="mr-2">
          <a
            href="#"
            className={`inline-flex items-center p-4 border-b-2 group ${
              view === 3 ? "border-blue-600 text-blue-600" : "border-transparent"
            }`}
            onClick={() => setView(3)}
          >
            <span className="material-icons-outlined mr-1" style={{ fontSize: "16px" }}>
              calendar_view_week
            </span>{" "}
            Cols
          </a>
        </li>
        <li className="mr-2">
          <a
            href="#"
            className={`inline-flex items-center p-4 border-b-2 group ${
              view === 1 ? "border-blue-600 text-blue-600" : "border-transparent"
            }`}
            onClick={() => setView(1)}
          >
            <span className="material-icons-outlined mr-1" style={{ fontSize: "16px" }}>
              calendar_view_day
            </span>{" "}
            List
          </a>
        </li>
      </ul>
    </div>
  )
}
