import { parseDate, parseLatLng } from "../../properties"
import {
  addDays,
  differenceInDays,
  format,
  isAfter,
  isBefore,
  startOfDay,
  subDays,
  subYears,
} from "date-fns"
import { formatDate, round } from "../../utils"
import { FunctionDefs } from "./index"
import { DataWithProvenance } from "../scopes"
import LatLngLiteral = google.maps.LatLngLiteral
import { isEqual as isDateEqual } from "date-fns"

interface WeatherContext {
  locations: DataWithProvenance<google.maps.LatLngLiteral>[]
  dates: DataWithProvenance<Date>[]
}

export const WEATHER_FN: FunctionDefs = {
  Weather: {
    summaryView: ({ value }) => {
      return <WeatherInfoView value={value} />
    },
    autocomplete: {
      label: "Weather",
      value: "{Weather($)}",
    },
    function: async ([node], namedArgs, scope) => {
      let onDate = namedArgs.on ? parseDate(namedArgs.on.id) : undefined
      let inLocation = namedArgs.in
        ? parseLatLng(await namedArgs.in.getPropertyAsync("position"))
        : undefined

      if (onDate && inLocation) {
        const weather = await getWeatherInformation(onDate, inLocation)

        if (weather) {
          const computation = {
            name: "Weather",
            data: {
              on: formatDate(onDate),
              at: await namedArgs.in.getLabelAsync(),
              ...weather,
            },
          }

          scope.addComputationResult(computation)
        }

        return
      }

      const rootContext: WeatherContext = {
        dates: onDate ? [{ scope: namedArgs.on, data: onDate }] : [],
        locations: inLocation ? [{ scope: namedArgs.in, data: inLocation }] : [],
      }

      await scope.traverseScopeAsync<WeatherContext>(
        async (scope, context: WeatherContext) => {
          const newLocations = await scope.getOwnPropertyAndPropertiesOfTransclusionAsync(
            "position",
            parseLatLng
          )

          for (const newLocation of newLocations) {
            for (const date of context.dates) {
              const weather = await getWeatherInformation(date.data, newLocation.data)

              if (weather) {
                const computation = {
                  name: "Weather",
                  data: {
                    on: formatDate(date.data),
                    at: await newLocation.scope.getLabelAsync(),
                    ...weather,
                  },
                }

                scope.addComputationResult(computation)
              }
            }
          }

          const allLocations = [...context.locations]
          for (const newLocation of newLocations) {
            if (
              allLocations.every(
                ({ data }) => data.lat !== newLocation.data.lat && data.lng !== newLocation.data.lng
              )
            ) {
              allLocations.push(newLocation)
            }
          }

          // can't use getOwnPropertyAndPropertiesOfTransclusionAsync because parsing dates for own scope and transcluded scope works differently

          console.log(await scope.getPropertyAsync("date"))

          // const value = await scope.getPropertyAsync("date")

          const ownDate = parseDate((await scope.getPropertyAsync("date"))?.id)
          const transcludedDates: DataWithProvenance<Date>[] = (
            await Promise.all(
              Object.values(scope.transcludedScopes).map(async (transcludedScope) => ({
                scope: transcludedScope,
                data: parseDate(transcludedScope.id),
              }))
            )
          ).filter(({ data }) => data !== undefined) as DataWithProvenance<Date>[]

          const newDates = ownDate
            ? transcludedDates.concat({ data: ownDate, scope })
            : transcludedDates

          for (const newDate of newDates) {
            for (const location of allLocations) {
              const weather = await getWeatherInformation(newDate.data, location.data)

              if (weather) {
                const computation = {
                  name: "Weather",
                  data: {
                    on: formatDate(newDate.data),
                    at: await location.scope.getLabelAsync(),
                    ...weather,
                  },
                }

                scope.addComputationResult(computation)
              }
            }
          }

          const allDates = [...context.dates]
          for (const newDate of newDates) {
            if (allDates.every(({ data }) => !isDateEqual(data, newDate.data))) {
              allDates.push(newDate)
            }
          }

          return {
            dates: allDates,
            locations: allLocations,
          }
        },
        rootContext,
        { skipTranscludedScopes: true }
      )

      // todo: return value
    },
  },
}

export interface WeatherInformation {
  min: number
  max: number
  mean: number
  weatherCode?: number
}

async function getWeatherInformation(
  date: Date,
  location: google.maps.LatLngLiteral
): Promise<WeatherInformation | undefined> {
  const alignedDate = startOfDay(date)
  const currentDay = startOfDay(Date.now())
  const lastDayWithPrediction = addDays(currentDay, 16)

  // compute temperature based on historic data if it is before or after the range of forcast
  if (isBefore(alignedDate, currentDay) || isAfter(alignedDate, lastDayWithPrediction)) {
    const historicData = await fetchHistoricWeatherData(location)

    const day = alignedDate.getDate().toString().padStart(2, "0")
    const month = (alignedDate.getMonth() + 1).toString().padStart(2, "0")
    const year = alignedDate.getFullYear().toString().padStart(4, "0")

    const dayGroup = historicData[`${month}-${day}`]

    // has historic data of that exact day
    if (dayGroup[year]) {
      return dayGroup[year]
    }

    // otherwise compute normal of that day
    // we could fetch more data if the date is more than 20 years ago, but to keep things simple we just compute the normals
    let totalMin = 0
    let totalMax = 0
    let totalMean = 0

    const measurements = Object.values(dayGroup)

    for (const measurement of measurements) {
      totalMax += measurement.max
      totalMin += measurement.min
      totalMean += measurement.mean
    }

    return {
      min: round(totalMin / measurements.length),
      max: round(totalMax / measurements.length),
      mean: round(totalMean / measurements.length),
    }
  }

  // ... otherwise use forecast
  const forecast = await fetchForecast(location)
  const offset = differenceInDays(alignedDate, currentDay)

  return forecast[offset]
}

const FORECAST_CACHE: { [location: string]: WeatherInformation[] } = {}

const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

async function fetchForecast(location: google.maps.LatLngLiteral): Promise<any> {
  const key = `${location.lat}:${location.lng}`

  const cachedForecast = FORECAST_CACHE[key]
  if (cachedForecast) {
    return cachedForecast
  }

  const rawForecast = await fetch(
    [
      "https://api.open-meteo.com/v1/forecast",
      `?latitude=${location.lat}`,
      `&longitude=${location.lng}`,
      "&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,weathercode",
      "&forecast_days=16",
      `&timezone=${encodeURIComponent(currentTimezone)}`,
    ].join("")
  ).then((res) => res.json())

  const forecast = rawForecast.daily.time.map((time: string, index: number) => ({
    min: rawForecast.daily.temperature_2m_min[index],
    max: rawForecast.daily.temperature_2m_max[index],
    mean: rawForecast.daily.temperature_2m_mean[index],
    weatherCode: rawForecast.daily.weathercode[index],
  }))

  FORECAST_CACHE[key] = forecast

  return forecast
}

interface HistoricWeather {
  [monthDay: string]: { [year: string]: WeatherInformation }
}

const HISTORIC_WEATHER_CACHE: { [location: string]: HistoricWeather } = {}

async function fetchHistoricWeatherData(location: google.maps.LatLngLiteral) {
  const locationKey = `${location.lat}:${location.lng}`
  const cachedHistoricWeather = HISTORIC_WEATHER_CACHE[locationKey]
  if (cachedHistoricWeather) {
    return cachedHistoricWeather
  }

  const historicWeatherRaw = await fetch(
    [
      "https://archive-api.open-meteo.com/v1/archive",
      `?latitude=${location.lat}`,
      `&longitude=${location.lng}`,
      "&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,temperature_2m_min",
      `&timezone=${encodeURIComponent(currentTimezone)}`,
      `&start_date=${format(subYears(Date.now(), 20), "yyyy-MM-dd")}`, // take in last 20 years
      `&end_date=${format(subDays(Date.now(), 1), "yyyy-MM-dd")}`,
    ].join("")
  ).then((res) => res.json())

  const historicWeather: HistoricWeather = {}

  for (let i = 0; i < historicWeatherRaw.daily.time.length; i++) {
    const date = historicWeatherRaw.daily.time[i]
    const min = historicWeatherRaw.daily.temperature_2m_min[i]
    const max = historicWeatherRaw.daily.temperature_2m_max[i]
    const mean = historicWeatherRaw.daily.temperature_2m_mean[i]

    const [year, month, day] = date.split("-")
    const dayGroupKey = `${month}-${day}`

    let dayGroup = historicWeather[dayGroupKey]

    if (!dayGroup) {
      dayGroup = historicWeather[dayGroupKey] = {}
    }

    dayGroup[year] = { min, max, mean }
  }

  HISTORIC_WEATHER_CACHE[locationKey] = historicWeather

  return historicWeather
}

interface WeatherInfoViewProps {
  value: WeatherInformation
}

export function WeatherInfoView({ value }: WeatherInfoViewProps) {
  const description = value.weatherCode
    ? getWeatherDescription(value.weatherCode).toLowerCase()
    : ""

  return (
    <div className="flex gap-2">
      {value.weatherCode && getWeatherIcon(value.weatherCode)}
      <span className="text-gray-500">{description}</span>
      <span className="text-gray-300"> </span>
      <span className={value.min <= 0 ? "text-blue-500" : "text-gray-500"}>{value.min}</span>
      <span className="text-gray-300">•</span>
      <span className={value.max <= 0 ? "text-blue-500" : "text-gray-500"}>{value.max}</span>
    </div>
  )
}

function getWeatherDescription(code: number): string {
  switch (code) {
    case 0:
      return "Clear sky"
    case 1:
      return "Mainly clear"
    case 2:
      return "Partly cloudy"
    case 3:
      return "Overcast"
    case 45:
      return "Fog"
    case 48:
      return "Depositing rime fog"
    case 51:
      return "Light drizzle"
    case 53:
      return "Moderate drizzle"
    case 55:
      return "Dense drizzle"
    case 56:
      return "Light freezing drizzle"
    case 57:
      return "Intense freezing drizzle"
    case 61:
      return "Slight rain"
    case 63:
      return "Moderate rain"
    case 65:
      return "Heavy rain"
    case 66:
      return "Light freezing rain"
    case 67:
      return "Heavy freezing rain"
    case 71:
      return "Slight snow fall"
    case 73:
      return "Moderate snow fall"
    case 75:
      return "Heavy snow fall"
    case 77:
      return "Snow grains"
    case 80:
      return "Slight rain showers"
    case 81:
      return "Moderate rain showers"
    case 82:
      return "Violent rain showers"
    case 85:
      return "Slight snow showers"
    case 86:
      return "Heavy snow showers"
    case 95:
      return "Thunderstorm"
    case 96:
      return "Thunderstorm with slight hail"
    case 99:
      return "Thunderstorm with heavy hail"
    default:
      return ""
  }
}

function getWeatherIcon(code: number) {
  switch (code) {
    case 0: // clear sky
    case 1: // mainly clear
      return "☀️"

    case 2: // partly cloudy
      return "🌤"

    case 3: // overcast
      return "⛅️"

    case 48: // depositing rime fog
    case 45: // fog
      return "🌫"

    case 80: // Slight rain showers"
    case 81: // Moderate rain showers"
    case 51: // light drizzle
    case 53: // moderate drizzle
    case 55: // dense drizzle
    case 56: // light freezing drizzle
    case 61: // Slight rain
    case 66: // Light freezing rain
      return "🌧"

    case 86: // Heavy snow showers
    case 71: // Slight snow fall
    case 73: // Moderate snow fall
    case 75: // Heavy snow fall
    case 77: // Snow grains
    case 85: // Slight snow showers
      return "❄️"

    case 82: // Violent rain showers
    case 57: // Intense freezing drizzle
    case 63: // Moderate rain
    case 65: // Heavy rain
    case 67: // Heavy freezing rain
      return "🌧"

    case 95: // Thunderstorm
    case 96: // Thunderstorm with slight hail
    case 99: // Thunderstorm with heavy hail
      return "⛈"

    default:
      return null
  }
}