import { DataWithProvenance } from "../language/scopes"
import { DateContents, isSameDay } from "./CalendarGrid"
import { Scope } from "../language/scopes"
import { Time } from "../properties"
import { safeJsonStringify } from "../utils"

interface CalendarColsProps {
  dates: DateInfo[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

interface DateInfo { 
  date: Date, 
  scopes: Scope[],
  times: {
    [time:string]: {
      time: Time,
      scopes: Scope[]
    }
  }
}

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

  const hoursOfDay = Array.from({ length: 24 }, (_, i) => i);

  function otherDataFor(matchingDates: DateInfo[], hour: number): string[] {
    return ([...new Set(
      matchingDates.flatMap(d => (
        d.scopes.flatMap(s => (
          s.extractDataInScope(scope => (
            scope.valueOf(0)?.hourly?.[`${hour.toString().padStart(2, '0')}:00`]
          )).flatMap(v => v.data)
          .flatMap(data => {
            console.log(data);
            
            let results = [] 

            if (data.windgusts_10m > 10) {
              results.push("High winds")
            }
            else if (data.windspeed_10m > 8) {
              results.push("High winds")
            }

            if (data.precipitation_probability > 0.25) {
              results.push("Precipitation")
            }

            if (data.temperature_2m <= 0) {
              results.push("Freezing")
            }

            return results
          })
        ))
      ))
    )])
  }

  return (
    <div className="overflow-scroll">
      <table className="table-auto border-collapse border border-gray-300">
        <thead>
          <tr>
            <th></th>
            {datesInRange.map((date, index) => (
              <th
                key={index}
                className="py-2 px-3 bg-gray-100 border border-gray-300"
                style={{ minWidth: '140px' }}
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
              className={`${
                hour % 2 === 0 ? 'bg-gray-100' : 'bg-white'
              } border border-gray-300`}
              style={{ height: '60px' }}
            >
              <td className="border border-gray-300 px-3 text-xs text-gray-400">
                {hour.toString().padStart(2, '0')}:00
              </td>
              
              {datesInRange.map((date, index) => {
                const matchingDates = dates.filter((d) => d.date.getTime() === date.getTime())
                const matchingTimes = matchingDates.flatMap(d => {
                  const matchingKeys = Object.keys(d.times).filter(key => key.startsWith(`${hour.toString().padStart(2, '0')}:`));
                  const matchingScopes = matchingKeys.flatMap(key => d.times[key]?.scopes || []);
                  return matchingScopes;
                });

                return (
                  <td
                    key={`${date}_${hour}`}
                    className="border border-gray-300"
                  >
                    <div className="flex gap-2">
                      {otherDataFor(matchingDates, hour).map(label => (
                        <p className="my-1 px-1 rounded-sm bg-blue-200 text-blue-600 font-medium
                        text-sm">{label}</p>
                      ))}
                    </div>

                    <DateRow
                      key={date.toISOString()}
                      scopes={matchingTimes}
                      date={date}
                      isHoveringOverId={isHoveringOverId}
                      setIsHoveringOverId={setIsHoveringOverId}
                    />
                  </td>
                )
              })}
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
