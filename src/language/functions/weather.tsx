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
import { round } from "../../utils"
import { FunctionDefs } from "./function-def"
import { DataWithProvenance } from "../scopes"
import { FunctionSuggestion, Parameter } from "../function-suggestions"

interface WeatherContext {
  locations: DataWithProvenance<google.maps.LatLngLiteral>[]
  dates: DataWithProvenance<Date>[]
}

export const WEATHER_FN: FunctionDefs = {
  Weather: {
    icon: "light_mode",
    suggestions: (parameters: Parameter[]) => {
      const dates = parameters.filter((p) => p.value.type === "date")
      const locations = parameters.filter((p) => p.value.type === "location")

      const suggestions: FunctionSuggestion[] = []

      for (const date of dates) {
        for (const location of locations) {
          let rank = location.distance + date.distance

          suggestions.push({
            icon: "light_mode",
            name: "Weather",
            arguments: [
              {
                label: "in",
                value: location.value.expression,
              },
              {
                label: "on",
                value: date.value.expression,
              },
            ],
            rank,
          })
        }
      }

      return suggestions
    },
    summaryView: (value) => getWeatherSummary(value),
    autocomplete: {
      icon: "light_mode",
      name: "Weather",
      arguments: [
        {
          label: "in",
        },
        {
          label: "on",
        },
      ],
    },
    parameters: {
      in: "location",
      on: "date",
    },
    function: async ([node], namedArgs, scope) => {
      const unit = namedArgs.unit
        ? namedArgs.unit
        : (await scope.lookupValueAsync("temperatureUnit")) ?? "celsius"

      let onDate = namedArgs.on ? parseDate(namedArgs.on.id) : undefined
      let inLocation = namedArgs.in
        ? parseLatLng(await namedArgs.in.getPropertyAsync("position"))
        : undefined

      if (namedArgs.on && namedArgs.in) {
        return onDate && inLocation ? getWeatherInformation(onDate, inLocation, unit) : undefined
      }
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
  location: google.maps.LatLngLiteral,
  unit: string
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
      return convertToUnit(dayGroup[year], unit)
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

    return convertToUnit(
      {
        min: round(totalMin / measurements.length),
        max: round(totalMax / measurements.length),
        mean: round(totalMean / measurements.length),
      },
      unit
    )
  }

  // ... otherwise use forecast
  const forecast = await fetchForecast(location)
  const offset = differenceInDays(alignedDate, currentDay)

  return convertToUnit(forecast[offset], unit)
}

function convertToUnit(information: WeatherInformation, unit: string): WeatherInformation {
  if (unit.toLowerCase() === "fahrenheit") {
    const { min, max, mean } = information

    return {
      ...information,
      min: round((min * 9) / 5 + 32),
      max: round((max * 9) / 5 + 32),
      mean: round((mean * 9) / 5 + 32),
    }
  }

  return information
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
      "&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,weathercode&hourly=temperature_2m,windspeed_10m,windgusts_10m,precipitation_probability",
      "&forecast_days=16",
      `&timezone=${encodeURIComponent(currentTimezone)}`,
    ].join("")
  ).then((res) => res.json())

  const forecast = rawForecast.daily.time.map((time: string, index: number) => {
    const hourlyOffset = index * 24

    return {
      min: rawForecast.daily.temperature_2m_min[index],
      max: rawForecast.daily.temperature_2m_max[index],
      mean: rawForecast.daily.temperature_2m_mean[index],
      weatherCode: rawForecast.daily.weathercode[index],
      hourly: rawForecast.hourly.time
        .slice(hourlyOffset, hourlyOffset + 42)
        .reduce((hourlyObj: any, hourlyTime: any, hourlyIndexWithoutOffset: any) => {
          const hourlyIndex = hourlyIndexWithoutOffset + hourlyOffset
          const timePattern = /T(\d{2}:\d{2})/
          console.log("key", hourlyTime.match(timePattern)?.[1] || hourlyTime, hourlyTime)

          hourlyObj[hourlyTime.match(timePattern)?.[1] || hourlyTime] = {
            temp: rawForecast.hourly.temperature_2m[hourlyIndex],
            precipitation_probability: rawForecast.hourly.precipitation_probability[hourlyIndex],
            windspeed_10m: rawForecast.hourly.windspeed_10m[hourlyIndex],
            windgusts_10m: rawForecast.hourly.windgusts_10m[hourlyIndex],
          }

          return hourlyObj
        }, {}),
    }
  })

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

    // filter out null values of recent dates where there is no historical data available yet
    if (min === null || max === null || mean === null) {
      continue
    }

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
  return <span className="flex flex-wrap gap-2">{getWeatherSummary(value)}</span>
}

export function getWeatherSummary(value: WeatherInformation): string {
  const result: string[] = []

  const weatherIcon = value.weatherCode ? getWeatherIcon(value.weatherCode) : "☀️"
  if (weatherIcon) {
    result.push(weatherIcon)
  }

  const description = value.weatherCode
    ? getWeatherDescription(value.weatherCode).toLowerCase()
    : undefined
  if (description) {
    result.push(description)
  }

  result.push(`${Math.round(value.min)}° / ${Math.round(value.max)}°`)

  return result.join(" ")
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
