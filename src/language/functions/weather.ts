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
import { DataWithProvenance2 } from "../scopes"
import LatLngLiteral = google.maps.LatLngLiteral

interface WeatherContext {
  locations: DataWithProvenance2<google.maps.LatLngLiteral>[]
  dates: DataWithProvenance2<Date>[]
}

export const WEATHER_FN: FunctionDefs = {
  Weather: {
    autocomplete: {
      label: "Weather",
      value: "{Weather($)}",
    },
    function: async ([node], namedArgs, scope) => {
      let onDate = namedArgs.on ? parseDate(namedArgs.on.id) : undefined
      let inLocation = namedArgs.in
        ? parseLatLng(await namedArgs.in.getPropertyAsync("position"))
        : undefined

      const rootContext: WeatherContext = {
        dates: onDate ? [{ scope: namedArgs.on, data: onDate }] : [],
        locations: inLocation ? [{ scope: namedArgs.in, data: inLocation }] : [],
      }

      await scope.traverseScopeAsync<WeatherContext>(
        async (scope, context: WeatherContext) => {
          const ownLocation = parseLatLng(await scope.getPropertyAsync("position"))
          const transcludedLocations: DataWithProvenance2<LatLngLiteral>[] = (
            await Promise.all(
              Object.values(scope.transcludedScopes).map(async (transcludedScope) => ({
                scope: transcludedScope,
                data: parseLatLng(await transcludedScope.getPropertyAsync("position")),
              }))
            )
          ).filter(
            ({ data }) => data !== undefined
          ) as DataWithProvenance2<google.maps.LatLngLiteral>[]

          const newLocations = ownLocation
            ? transcludedLocations.concat({ data: ownLocation, scope })
            : transcludedLocations

          for (const newLocation of newLocations) {
            for (const date of context.dates) {
              const weather = await getWeatherInformation(date.data, newLocation.data)

              if (weather) {
                const computation = {
                  name: "Weather",
                  data: {
                    on: formatDate(date.data),
                    at: await newLocation.scope.valueOfAsync(),
                    ...weather,
                  },
                }

                scope.addComputationResult(computation)
              }
            }
          }

          /*

          // todo: handle multiple dates
          const newDate = parseDateRefsInScopeValue(scope)[0]
          if (newDate) {
            for (const location of context.locations) {
              scope.computed.weather = await getWeatherInformation(newDate, location)
            }
          }

          console.log(context)


          * /

           */
          return {
            dates: context.dates, // newDate ? context.dates.concat(newDate) : context.dates,
            locations: context.locations.concat(newLocations),
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
