import { DataWithProvenance } from "../language/scopes"
import { DateContents, isSameDay } from "./CalendarGrid"

interface CalendarColsProps {
  dates: DataWithProvenance<Date>[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export default function CalendarCols({
  dates,
  isHoveringOverId,
  setIsHoveringOverId,
}: CalendarColsProps) {
  let sortedDates = dates.map((d) => d.data).sort((a, b) => a.getTime() - b.getTime())

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
          const matchingDates = dates.filter((d) => d.data.getTime() === date.getTime())
          return (
            <DateRow
              key={date.toISOString()}
              data={matchingDates}
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
  data: DataWithProvenance<Date>[]
  date: Date
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function DateRow({ data, date, isHoveringOverId, setIsHoveringOverId }: DateRowProps) {
  const isToday = isSameDay(date, new Date())

  return (
    <div
      className={`py-2 mb-1 ${
        isToday ? "text-blue-600" : data === undefined ? "text-gray-400" : ""
      }`}
    >
      {date.toDateString()}
      <DateContents
        scopes={data.map(value => value.scope)}
        summary={true}
        isHoveringOverId={isHoveringOverId}
        setIsHoveringOverId={setIsHoveringOverId}
      />
    </div>
  )
}
