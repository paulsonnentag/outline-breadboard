import { DataWithProvenance, Scope } from "../language/scopes"
import classNames from "classnames"
import { SummaryView } from "./index"
import { RootOutlineEditor } from "../Root"
import { ComputationResultsSummaryView } from "../language/functions"

interface CalendarGridProps {
  dates: DataWithProvenance<Date>[]
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export default function CalendarGrid({
  dates,
  isHoveringOverId,
  setIsHoveringOverId,
}: CalendarGridProps) {
  let sortedDates = dates.map((d) => d.data).sort((a, b) => a.getTime() - b.getTime())

  if (sortedDates.length === 0) {
    sortedDates = [new Date(), new Date()]
  } else if (sortedDates.length === 1) {
    sortedDates.push(sortedDates[0])
  }

  const start = new Date(sortedDates[0].getFullYear(), sortedDates[0].getMonth(), 1)
  const end = new Date(
    sortedDates[sortedDates.length - 1].getFullYear(),
    sortedDates[sortedDates.length - 1].getMonth() + 1,
    0
  )

  const weeks = getWeeks(start, end, sortedDates)

  return (
    <div className="rounded-lg overflow-hidden">
      <table className="w-full table-fixed">
        <thead>
          <tr className="text-left">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <th key={day} className="py-3 px-1 font-medium text-gray-400">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i} className="week">
              {week.map((date, j) => (
                // todo: filter might filter out things that happen on the same day, but don't start at the beginning of the day
                <DateCell
                  key={j}
                  date={date}
                  data={dates.filter((d) => d.data.getTime() === date.getTime())}
                  showMonth={(i == 0 && j == 0) || date.getDate() === 1}
                  isHoveringOverId={isHoveringOverId}
                  setIsHoveringOverId={setIsHoveringOverId}
                />
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
  data: DataWithProvenance<Date>[]
  showMonth: boolean
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function DateCell({ date, data, showMonth, isHoveringOverId, setIsHoveringOverId }: DateCellProps) {
  const isToday = isSameDay(date, new Date())
  const monthName = showMonth ? date.toLocaleString("default", { month: "long" }) : null

  return (
    <td className="py-2 px-1">
      <div
        className={
          isToday
            ? "text-blue-600 font-medium"
            : data.length < 1
            ? "text-gray-400 font-medium"
            : "text-gray-600 font-medium"
        }
      >
        {date.getDate()} {monthName}
      </div>

      <DateContents
        scopes={data.map(value => value.scope)}
        summary={true}
        setIsHoveringOverId={setIsHoveringOverId}
        isHoveringOverId={isHoveringOverId}
      />
    </td>
  )
}

interface DateContentsProps {
  scopes: Scope[]
  summary?: boolean
  setIsHoveringOverId: (nodeId: string | undefined) => void
  isHoveringOverId: string | undefined
}

export function DateContents({ scopes, summary, setIsHoveringOverId, isHoveringOverId }: DateContentsProps) {
  return (<>
    {scopes.map(scope => 
      <div key={scope.id}>
        <DateContentsBlock scope={scope} summary={summary} setIsHoveringOverId={setIsHoveringOverId} isHoveringOverId={isHoveringOverId} />
        {/* Below includes an additional block of the local outline's tree if this date is included because of a reference to a date (that root date item is included in the above line) */}
        {(scope.parentScope && !scope.parentScope.childScopes.map(s => s.id).includes(scope.id)) && (
          <DateContentsBlock scope={scope.parentScope} summary={summary} setIsHoveringOverId={setIsHoveringOverId} isHoveringOverId={isHoveringOverId} />
        )}
      </div>
    )}
  </>
  )
}

interface DateContentsBlockProps {
  scope: Scope
  summary?: boolean
  setIsHoveringOverId: (nodeId: string | undefined) => void
  isHoveringOverId: string | undefined
}

function DateContentsBlock(props: DateContentsBlockProps) {
  const { scope, summary, setIsHoveringOverId, isHoveringOverId } = props

  return (
    <div
      className={classNames("text-sm text-gray-600", { "bg-slate-200 rounded": isHoveringOverId && scope.isInScope(isHoveringOverId) })}
      onMouseEnter={() => setIsHoveringOverId(scope.id)}
      onMouseLeave={() => isHoveringOverId === scope.id && setIsHoveringOverId(undefined)}
    >
      {summary && <>
        {scope.valueOf()}
        <SummaryView scope={scope} />
        <DateSummary {...props} />
      </>
      }
      {!summary && 
        <RootOutlineEditor
          focusOffset={0}
          nodeId={scope.id}
          index={0}
          path={[]}
          parentIds={[]}
          selectedPath={[]}
          onChangeSelectedPath={(newSelectedPath, newFocusOffset = 0) => {
            
          }}
          onOpenNodeInNewPane={node => {}}
          isHoveringOverId={undefined}
          setIsHoveringOverId={() => {}}
          disableCustomViews={true}
        />
      }
    </div>
  )
}

function DateSummary(props: DateContentsBlockProps) {
  const { scope, summary, setIsHoveringOverId, isHoveringOverId } = props

  return (
    <ScopeSummary {...props} />
  )
}

interface ScopeSummaryProps {
  scope: Scope
  setIsHoveringOverId: (nodeId: string | undefined) => void
  isHoveringOverId: string | undefined
}

function ScopeSummary(props: ScopeSummaryProps) {
  return (
    <div>
      <ComputationResultsSummaryView scope={props.scope} />

      {props.scope.childScopes.map(scope => 
        <ScopeSummary {...props} scope={scope} />
      )}
    </div>
  )
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

function getWeeks(start: Date, end: Date, dates: Date[]): Date[][] {
  const weeks: Date[][] = []
  let curr = new Date(start)
  const dayOfWeek = curr.getDay()
  curr.setDate(curr.getDate() - dayOfWeek)
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
