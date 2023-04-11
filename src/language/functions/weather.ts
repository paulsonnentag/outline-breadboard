import { getGraphDocHandle, getNode, Graph } from "../../graph"
import {
  DataWithProvenance,
  parseDate,
  parseDateRefsInString,
  readLatLngsOfNode,
} from "../../properties"
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
import { FunctionDefs } from "./index"

export const WEATHER_FN: FunctionDefs = {
  Weather: {
    autocomplete: {
      label: "Weather",
      value: "{Weather($)}",
    },
    function: ([node], { date }) => {
      const graphDocHandle = getGraphDocHandle()
      const passedInDate = date && date.value ? parseDate(date.value) : undefined

      interface WeatherContext {
        dates: DataWithProvenance<Date>[]
        locations: DataWithProvenance<google.maps.LatLngLiteral>[]
      }

      const rootNode = isMethod ? getNode(graph, selfId) : node

      const parameters: [
        DataWithProvenance<Date>,
        DataWithProvenance<google.maps.LatLngLiteral>
      ][] = []

      const datesInRootNode = parseDateRefsInString(rootNode.value)
      const locationsInRootNode = readLatLngsOfNode(graph, rootNode.id)

      const context = {
        dates: passedInDate ? datesInRootNode.concat(passedInDate) : datesInRootNode,
        locations: locationsInRootNode,
      }

      function collectWeatherInputParameters(
        graph: Graph,
        nodeId: string,
        context: WeatherContext
      ) {
        const node = getNode(graph, nodeId)

        const newDates = parseDateRefsInString(node.value).filter((newDate) =>
          context.dates.every((oldDate) => oldDate.toString() !== newDate.toString())
        )
        const newLocations = readLatLngsOfNode(graph, nodeId).filter((newLocation) =>
          context.locations.every(
            (oldLocation) =>
              oldLocation.data.lat !== newLocation.data.lat &&
              oldLocation.data.lng !== newLocation.data.lng
          )
        )

        for (const location of context.locations) {
          for (const newDate of newDates) {
            parameters.push([newDate, location])
          }
        }

        for (const date of context.dates) {
          for (const newLocation of newLocations) {
            // todo: add back method

            /* if (isMethod) {
              getWeatherInformation(date.data, newLocation.data).then((temperature) => {
                graphDocHandle.change((doc) => {
                  const node = getNode(doc.graph, newLocation.nodeId)
                  node.computedProps.weather = temperature
                })
              })
            } */

            parameters.push([date, newLocation])
          }
        }

        const newContext = {
          dates: context.dates.concat(newDates),
          locations: context.locations.concat(newLocations),
        }

        node.children.forEach((childId) => {
          collectWeatherInputParameters(graph, childId, newContext)
        })
      }

      collectWeatherInputParameters(graph, rootNode.id, context)

      // todo: return actual outline
      return Promise.all(
        parameters.map(async ([date, location]) => ({
          date: getNode(graph, date.nodeId).value,
          location: getNode(graph, location.nodeId).value,
          temperature: await getWeatherInformation(date.data, location.data),
        }))
      ).then((results) => {
        const obj = results.reduce((acc: any, cur) => {
          const key = `Weather in ${cur.location} on ${cur.date}`
          acc[key] = cur
          return acc
        }, {})
        return obj
      })
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
