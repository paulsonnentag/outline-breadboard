import { DataWithProvenance } from "../properties"
import { DateContents, isSameDay } from "./CalendarGrid"

interface CalendarListProps {
  dates: DataWithProvenance<Date>[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export default function CalendarList({ dates, isHoveringOverId, setIsHoveringOverId }: CalendarListProps) {
  const sortedDates = [...dates].sort((a, b) => a.data.getTime() - b.data.getTime())
  const startDate = sortedDates[0].data
  const endDate = sortedDates[sortedDates.length - 1].data

  const datesInRange: Date[] = []
  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    datesInRange.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return (
    <div>
      {datesInRange.map((date) => {
        const matchingDate = dates.find((d) => d.data.getTime() === date.getTime())
        return <DateRow key={date.toISOString()} data={matchingDate} date={date} isHoveringOverId={isHoveringOverId} setIsHoveringOverId={setIsHoveringOverId} />
      })}
    </div>
  )
}

interface DateRowProps {
  data: DataWithProvenance<Date> | undefined
  date: Date
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function DateRow({ data, date, isHoveringOverId, setIsHoveringOverId }: DateRowProps) {
  const isToday = isSameDay(date, new Date())
  
  return (
    <div 
      className={`py-2 mb-1 ${isToday ? "text-blue-600" : data === undefined ? "text-gray-400" : ""} ${data && data.nodeId === isHoveringOverId ? "bg-slate-200" : ""} ${data ? "border-t-2 border-slate-400" : "border-t-2 border-slate-100"}`}
      onMouseEnter={() => data && setIsHoveringOverId(data.nodeId)} 
      onMouseLeave={() => data && isHoveringOverId == data.nodeId && setIsHoveringOverId(undefined)}  
    >
      {date.toDateString()} 
      {data && <DateContents nodeId={data.nodeId} />}
    </div>
  )
}