import { Scope } from "../language/scopes"
import { DateContents, isSameDay } from "./CalendarGrid"
import { Time } from "../properties"
import ColorScale from "color-scales"
import { SHOW_MOCK_DATA_IN_CALENDAR } from "../config"
import { getHourlyWeatherSummary } from "../language/functions/weather"

interface CalendarColsProps {
  dates: DateInfo[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

interface DateInfo {
  date: Date
  scopes: Scope[]
  times: {
    [time: string]: {
      time: Time
      scopes: Scope[]
    }
  }
}

let colorScale = new ColorScale(0, 1, ["#ffffff", "#bfdbfe"])

export default function CalendarBlocks({
  dates,
  isHoveringOverId,
  setIsHoveringOverId,
}: CalendarColsProps) {
  let sortedDates = dates.map((d) => d.date).sort((a, b) => a.getTime() - b.getTime())

  if (sortedDates.length === 0) {
    sortedDates = [new Date(), new Date()]
  } else if (sortedDates.length === 1) {
    sortedDates.push(sortedDates[0])
  }

  const startDate = sortedDates[0]
  const endDate = sortedDates[sortedDates.length - 1]

  const datesInRange: Date[] = []
  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    datesInRange.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  const hoursOfDay = Array.from({ length: 24 }, (_, i) => i).slice(8)

  function otherDataFor(
    matchingDates: DateInfo[],
    hour: number
  ): { label: string; value: number }[] {
    return [
      ...new Set(
        matchingDates.flatMap((d) =>
          d.scopes.flatMap((s) =>
            s
              .extractDataInScope(
                (scope) => scope.valueOf(0)?.hourly?.[`${hour.toString().padStart(2, "0")}:00`]
              )
              .flatMap((v) => v.data)
              .flatMap((data) => {
                let results: { label: string; value: number }[] = []

                // These should be defined by the user...
                /*
                if (data.windgusts_10m > 40) {
                  results.push({ label: "High winds", value: 1 })
                } else if (data.windspeed_10m > 20) {
                  results.push({ label: "High winds", value: 1 })
                }*/

                results.push({
                  label: getHourlyWeatherSummary(data),
                  value: 0,
                })

                if (data.temperature_2m <= 0) {
                  results.push({ label: "Freezing", value: 1 })
                }

                return results
              })
          )
        )
      ),
    ]
  }

  console.log(datesInRange)

  return (
    <div className="overflow-scroll relative">
      {SHOW_MOCK_DATA_IN_CALENDAR && (
        <div className="w-[100px] absolute top-[161px] left-[202px] bg-blue-50 border rounded border-blue-200 h-[360px] p-2">
          Go to flea market near
          <br />
          <span className="text-blue-500 break-words">Frankenberger Park</span>
        </div>
      )}

      <table className="table-auto border-collapse border border-gray-300">
        <thead>
          <tr>
            <th></th>
            {datesInRange.map((date, index) => (
              <th
                key={index}
                className="py-2 px-3 bg-gray-100 border border-gray-300"
                style={{ minWidth: "140px" }}
                colSpan={2}
              >
                {date.toLocaleString("default", { weekday: "long", month: "long", day: "numeric" })}

                {/* Put in non-timed stuff here? */}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hoursOfDay.map((hour) => (
            <tr
              key={hour}
              className={`${hour % 2 === 0 ? "bg-gray-100" : "bg-white"} border border-gray-300`}
              style={{ height: "60px" }}
            >
              <td className="border border-gray-300 px-3 text-xs text-gray-400">
                {hour.toString().padStart(2, "0")}:00
              </td>

              {datesInRange.map((date, index) => {
                const matchingDates = dates.filter((d) => d.date.getTime() === date.getTime())
                const matchingTimes = matchingDates.flatMap((d) => {
                  const matchingKeys = Object.keys(d.times).filter((key) =>
                    key.startsWith(`${hour.toString().padStart(2, "0")}:`)
                  )
                  const matchingScopes = matchingKeys.flatMap((key) => d.times[key]?.scopes || [])
                  return matchingScopes
                })

                return (
                  <td key={`${date}_${hour}`} className="border border-gray-300 w-[138px]">
                    <div className="flex gap-2 px-2 py-1">
                      {otherDataFor(matchingDates, hour).map((entry) => (
                        <p className="px-1 rounded border text-purple-600 border-purple-200 cursor-pointer hover:bg-purple-200">
                          {entry.label}
                        </p>
                      ))}
                    </div>

                    {!SHOW_MOCK_DATA_IN_CALENDAR && (
                      <DateRow
                        key={date.toISOString()}
                        scopes={matchingTimes}
                        date={date}
                        isHoveringOverId={isHoveringOverId}
                        setIsHoveringOverId={setIsHoveringOverId}
                      />
                    )}
                  </td>
                )
              })}

              <td className="border border-gray-300 px-3 text-xs text-gray-400 w-[110px]"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface DateRowProps {
  date: Date
  scopes: Scope[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function DateRow({ date, scopes, isHoveringOverId, setIsHoveringOverId }: DateRowProps) {
  const isToday = isSameDay(date, new Date())

  return (
    <DateContents
      scopes={scopes}
      isHoveringOverId={isHoveringOverId}
      setIsHoveringOverId={setIsHoveringOverId}
    />
  )
}
