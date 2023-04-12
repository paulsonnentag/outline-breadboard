import { DataWithProvenance } from "../properties";

interface CalendarListProps {
  dates: DataWithProvenance<Date>[];
}

export default function CalendarList({ dates }: CalendarListProps) {
  const sortedDates = [...dates].sort((a, b) => a.data.getTime() - b.data.getTime());
  const startDate = sortedDates[0].data;
  const endDate = sortedDates[sortedDates.length - 1].data;

  const datesInRange: Date[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    datesInRange.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return (
    <div>
      {datesInRange.map((date) => {
        const matchingDate = dates.find((d) => d.data.getTime() === date.getTime());
        return <DateRow key={date.toISOString()} data={matchingDate} date={date} />;
      })}
    </div>
  );
}

interface DateRowProps {
  data: DataWithProvenance<Date> | undefined;
  date: Date;
}

function DateRow({ data, date }: DateRowProps) {
  return (
    <div className={data === undefined ? "text-gray-400" : ""}>
      {date.toDateString()} {data && `(${data.nodeId})`}
    </div>
  );
}