import { DataWithProvenance } from "../language/scopes"
import { DateContents, isSameDay } from "./CalendarGrid"
import { Scope } from "../language/scopes"

interface CalendarColsProps {
  dates: { date: Date, scopes: Scope[] }[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export default function CalendarCols({
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

  return (
    <div className="overflow-scroll">
      <div className="flex flex-grid gap-2">
        {datesInRange.map((date) => {
          // todo: filter might filter out things that happen on the same day, but don't start at the beginning of the day
          const matchingDates = dates.filter((d) => d.date.getTime() === date.getTime())
          const scopes = matchingDates.reduce((prev, cur) => prev.concat(cur.scopes), [] as Scope[])
          return (
            <DateRow
              key={date.toISOString()}
              scopes={scopes}
              date={date}
              isHoveringOverId={isHoveringOverId}
              setIsHoveringOverId={setIsHoveringOverId}
            />
          )
        })}
      </div>
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
    <div
      className={`py-2 mb-1 ${
        isToday ? "text-blue-600" : scopes.length < 1 ? "text-gray-400" : ""
      }`}
    >
      {date.toDateString()}
      <DateContents
        scopes={scopes}
        isHoveringOverId={isHoveringOverId}
        setIsHoveringOverId={setIsHoveringOverId}
      />
    </div>
  )
}
