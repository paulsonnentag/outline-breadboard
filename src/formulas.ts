import * as ohm from "ohm-js"
import { Node } from "ohm-js"
import { getGraphDocHandle, getNode, Graph, ValueNode } from "./graph"
import {
  DataWithProvenance,
  parseDate,
  parseDateRefsInString,
  parseLatLng,
  readLatLng,
  readLatLngsOfNode,
  readProperty,
} from "./properties"
import { point as turfPoint } from "@turf/helpers"
import turfDistance from "@turf/distance"
import { googleApi } from "./google"
import { isArray, last, round } from "./utils"
import {
  addDays,
  differenceInDays,
  format,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
  subDays,
  subYears,
} from "date-fns"
import DirectionsResult = google.maps.DirectionsResult
import { root } from "postcss"

// An object to store results of calling functions
const functionCache: { [key: string]: any } = {}

const GRAMMAR_SRC = `
Node {
  Bullet
    = Text
    
  Text
    = TextPart+

  TextPart
    = InlineExp
    | IdRef
    | MethodExp
    | TextLiteral

  InlineExp
    = "{" Exp "}"
  
  MethodExp
    = "#" letter+ "(" Argument* ")"
 
  Property
    = Key ":" Text

  ComputedProperty
    = Key "=" Exp

  Key
    = propertyChar+

  TextLiteral = textChar+

  textChar
    = ~("{"| "#") any

  Exp = AddExp
  
  SimpleExp
    = AccessExp
    | FunctionExp
    | StringLiteral
    | numberLiteral
    | IdRef

  AccessExp
    = SimpleExp "." PropertyName

  PropertyName
    = propertyChar+

  propertyChar
    = alnum | "_"

  StringLiteral
    = "\\"" StringChar+ "\\""

  numberLiteral
    = digit+

  IdRefChar
    = alnum | "_" | "-" | "/" 

  IdRef
    = "#[" IdRefChar+ "]"

  StringChar
    = alnum | "." | ":" | ">" | "-" | "(" | ")" | "[" | "]" | "=" | "'" | "/" | "*" | "!" | "$" | "_"

  FunctionExp
    = letter+ "(" Argument* ")"
        
  Argument 
    = (Key ":")? Exp ","?
    | Key ":" Exp? ","?

  AddExp
    = AddExp "+" MulExp --plus
    | AddExp "-" MulExp --minus
    | MulExp

  MulExp
    = MulExp "*" SimpleExp --times
    | MulExp "/" SimpleExp --divide
    | SimpleExp
}
`

function promisify(value: any) {
  return new Promise((resolve, _) => {
    resolve(value)
  })
}

export interface FunctionDef {
  function: (
    graph: Graph,
    positionalArgs: any[],
    namedArgs: { [name: string]: any },
    selfId: string,
    isMethod: boolean
  ) => any
  arguments?: {
    [arg: string]: string
  }
  description?: string
  autocomplete?: {
    label: string
    value: string // the value that is inserted, use "$" to mark where cursor should be placed
  }

  resultSummary?: () => {}
}

function unitShortName(unit: string) {
  switch (unit) {
    case "meters":
      return "m"

    case "kilometers":
      return "km"

    case "miles":
      return "mi"
    default:
      return unit
  }
}

const directionsServiceApi = googleApi.then((google) => {
  return new google.maps.DirectionsService()
})

function directionsResultToRoute(result: google.maps.DirectionsResult) {
  const route: google.maps.DirectionsRoute = result.routes[0] // todo: just pick the first route for now

  if (!route) {
    return undefined
  }

  const duration = `${round(
    route.legs.reduce((sum, leg) => (leg.duration?.value ?? 0) + sum, 0) / 60 / 60
  )} h`
  const distance = `${round(
    route.legs.reduce((sum, leg) => (leg.distance?.value ?? 0) + sum, 0) / 1000
  )} km`
  const shortDuration = duration?.replace("hours", "h").replace("mins", "m")

  console.log(route)

  return {
    __summary: `${distance}, ${shortDuration}`,
    distance,
    duration,
    geometry: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: route.overview_path.map(({ lat, lng }) => [lng, lat]),
      },
    },
  }
}

export const FUNCTIONS: { [name: string]: FunctionDef } = {
  Route: {
    function: async (graph, [stops], { from, to }) => {
      let waypoints = stops ? [...stops] : []

      if (!from && waypoints[0]) {
        from = waypoints.shift()
      }

      if (!to && last(waypoints)) {
        to = waypoints.pop()
      }

      const pos1 = from && from.id ? readLatLng(graph, from.id) : parseLatLng(from)
      const pos2 = to && to.id ? readLatLng(graph, to.id) : parseLatLng(to)
      const waypointPos = waypoints.map((waypoint) =>
        waypoint.id ? readLatLng(graph, waypoint.id) : parseLatLng(from)
      )

      if (!pos1 || !pos2 || waypointPos.some((pos) => !pos)) {
        return undefined
      }

      const graphDocHandle = getGraphDocHandle()
      const doc = await graphDocHandle.value()

      const key = JSON.stringify({ pos1, pos2, waypointPos })
      const cachedResult: DirectionsResult = doc.cache[key] ? JSON.parse(doc.cache[key]) : undefined

      if (cachedResult) {
        return directionsResultToRoute(cachedResult)
      }

      const directionsService = await directionsServiceApi

      return new Promise((resolve) => {
        console.log("fetch route")

        directionsService.route(
          {
            origin: pos1,
            destination: pos2,
            travelMode: google.maps.TravelMode.DRIVING,
            waypoints: waypoints.map((latLng) => ({
              location: latLng as google.maps.LatLngLiteral,
            })),
          },
          (result: google.maps.DirectionsResult | null) => {
            result = result ?? { routes: [] }

            graphDocHandle.change((graphDoc) => {
              graphDoc.cache[key] = JSON.stringify(result) // store it as string, because otherwise it takes a long time to write it into automerge
            })

            resolve(directionsResultToRoute(JSON.parse(JSON.stringify(result)))) // turn result into plain object, to keep behaviour consistent to when it's accessed from cache
          }
        )
      })
    },

    autocomplete: {
      label: "Route",
      value: "{Route(from:$ to:)}",
    },
  },

  Weather: {
    function: (graph, [node], { date }, selfId, isMethod) => {
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

        console.log(node.value)

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
            if (isMethod) {
              getTemperature(date.data, newLocation.data).then((temperature) => {
                graphDocHandle.change((doc) => {
                  const node = getNode(doc.graph, newLocation.nodeId)
                  node.computedProps.temperature = temperature
                })
              })
            }

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

      console.log(parameters)

      // todo: return actual outline
      return Promise.all(
        parameters.map(async ([date, location]) => ({
          date: getNode(graph, date.nodeId).value,
          location: getNode(graph, location.nodeId).value,
          temperature: await getTemperature(date.data, location.data),
        }))
      ).then((results) => {
        const obj = results.reduce((acc, cur) => {
          const key = `Weather in ${cur.location} on ${cur.date}`
          acc[key] = cur
          return acc
        }, {})
        return obj
      })
    },

    autocomplete: {
      label: "Weather",
      value: "{Weather($)}",
    },
  },

  Distance: {
    function: (graph, [], { from, to, unit = "kilometers" }) => {
      if (!from || !from.id || !to || !to.id) {
        return
      }

      const pos1 = readLatLng(graph, from.id)
      const pos2 = readLatLng(graph, to.id)

      if (!pos1 || !pos2) {
        return undefined
      }

      const distance = turfDistance(
        turfPoint([pos1.lat, pos1.lng]),
        turfPoint([pos2.lat, pos2.lng]),
        {
          units: unit,
        }
      )

      const formattedDistance = `${Math.round(distance)} ${unitShortName(unit)}`

      return {
        // this special summary property is used in the collapsed state
        __summary: formattedDistance,
        distance: formattedDistance,
        geometry: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [pos1.lng, pos1.lat],
              [pos2.lng, pos2.lat],
            ],
          },
        },
      }
    },

    autocomplete: {
      label: "Distance",
      value: "{Distance(from:$ to:)}",
    },
  },

  Get: {
    function: (graph, [object, key]) => {
      if (!object || !object.children || !key) {
        return promisify(undefined)
      }

      // try to access property on node itself

      const value = readProperty(graph, object.id, key)

      if (value !== undefined) {
        return promisify(value)
      }

      // otherwise interpret node as list

      return promisify(
        object.children.flatMap((childId: string) => {
          const value = readProperty(graph, childId, key)

          if (value === undefined) {
            return []
          }

          return value
        })
      )
    },
  },

  And: {
    function: (graph, args) => {
      return promisify(args.reduce((accumulator, element) => accumulator && element))
    },
    arguments: {
      "values, ...": "The boolean values to perform AND across.",
    },
  },
  Or: {
    function: (graph, args) =>
      promisify(args.reduce((accumulator, element) => accumulator || element)),
    arguments: {
      "values, ...": "The boolean values to perform OR across.",
    },
  },
  Not: {
    function: (graph, [arg]) => promisify(!arg),
    arguments: {
      "values, ...": "The boolean values to perform NOT across.",
    },
  },
  LessThan: {
    function: (graph, [a, b]) => promisify(a < b),
    arguments: {
      arg: "The numeric value to compare to 'compareValue'",
      compareValue: "The value to check if it is greater than 'arg'",
    },
  },
  GreaterThan: {
    function: (graph, [a, b]) => promisify(a > b),
    arguments: {
      arg: "The numeric value to compare to 'compareValue'",
      compareValue: "The value to check if it is greater than 'arg'",
    },
  },
  Divide: {
    function: (graph, [x, y]) => promisify(x / y),
    description: "Divides one numeric value by another.",
  },
  Multiply: {
    function: (graph, [x, y]) => promisify(x * y),
    description: "Multiplies two numeric values together.",
  },
  Plus: {
    function: (graph, [x, y]) => promisify(parseFloat(x) + parseFloat(y)),
    description: "Adds two numeric values together.",
  },
  Minus: {
    function: (graph, [x, y]) => promisify(x - y),
    description: "Subtracts one numeric value from another.",
  },
  Round: {
    function: (graph, [x]) => promisify(Math.round(x)),
    arguments: {
      numeric: "The numeric value to round to integers.",
    },
  },
}

function getDistanceFromLatLonInKm(
  pos1: google.maps.LatLngLiteral,
  pos2: google.maps.LatLngLiteral
) {
  var R = 6371 // Radius of the earth in km
  var dLat = deg2rad(pos2.lat - pos1.lat) // deg2rad below
  var dLon = deg2rad(pos2.lng - pos2.lng)
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(pos1.lat)) *
      Math.cos(deg2rad(pos2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  var d = R * c // Distance in km
  return d
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180)
}

const formulaGrammar = ohm.grammar(GRAMMAR_SRC)

const formulaSemantics = formulaGrammar.createSemantics().addOperation("toAst", {
  Text: (e) => e.children.map((child) => child.toAst()),

  TextLiteral: (e: Node) => new StringNode(e.source.startIdx, e.source.endIdx, e.sourceString),

  Exp: (e) => e.toAst(),

  SimpleExp: (e) => e.toAst(),
  InlineExp: (_, e, __) => {
    return e.toAst()
  },

  FunctionExp: (fnName, _p1, args, _p2) => {
    const from = fnName.source.startIdx
    const to = _p2.source.endIdx

    return new FnNode(
      from,
      to,
      fnName.sourceString,
      args.children.map((arg) => arg.toAst())
    )
  },

  MethodExp: (_, fnName, _p1, args, _p2) => {
    const from = _.source.startIdx
    const to = _p2.source.endIdx

    return new FnNode(
      from,
      to,
      fnName.sourceString,
      args.children.map((arg) => arg.toAst()),
      true
    )
  },

  Argument: (nameNode, _, exp, __) => {
    const from = nameNode.source.startIdx
    const to = __.source.endIdx
    // I should fix this in the grammar, depending on the rule that matches sometimes the name has ":" at the end sometimes not
    const name = nameNode.sourceString.endsWith(":")
      ? nameNode.sourceString.slice(0, -1)
      : nameNode.sourceString

    const rawValue = exp.toAst()
    const value = isArray(rawValue) ? undefined : rawValue // empty array means there is no value
    return new ArgumentNode(from, to, name, value)
  },

  IdRef: (_, chars, __) => {
    const from = _.source.startIdx
    const to = __.source.endIdx
    return new IdRefNode(from, to, chars.sourceString)
  },
  StringLiteral: function (_q1, string, _q2) {
    const from = _q1.source.startIdx
    const to = _q2.source.endIdx
    return new StringNode(from, to, string.sourceString)
  },
  numberLiteral: (num) => new NumberNode(num.source.startIdx, num.source.endIdx, num.sourceString),
  MulExp_times: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Multiply",
      [a, b].map((x) => x.toAst())
    )
  },
  MulExp_divide: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Divide",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, x.toAst()))
    )
  },
  AddExp_plus: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Plus",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, "", x.toAst()))
    )
  },
  AddExp_minus: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Minus",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, "", x.toAst()))
    )
  },

  AccessExp: (obj, _, key) => {
    const from = obj.source.startIdx
    const to = obj.source.endIdx

    return new FnNode(
      from,
      to,
      "Get",
      [obj, key].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, "", x.toAst()))
    )
  },

  PropertyName: (name) =>
    new StringNode(name.source.startIdx, name.source.endIdx, name.sourceString),

  _iter: (...args) => args.map((arg) => arg.toAst()),
})

interface AstNode {
  from: number
  to: number
  eval: (graph: Graph, selfId: string) => any
  getIdRefs: () => string[]
}

class UndefinedNode implements AstNode {
  constructor(readonly from: number, readonly to: number) {}

  eval() {
    return undefined
  }

  getIdRefs() {
    return []
  }
}

class FnNode implements AstNode {
  from: number
  to: number
  name: string
  args: ArgumentNode[]
  isMethod: boolean

  constructor(
    from: number,
    to: number,
    fnName: string,
    args: ArgumentNode[],
    isMethod: boolean = false // if true function is evaluated to apply to node where it's called from
  ) {
    this.from = from
    this.to = to
    this.name = fnName
    this.args = args
    this.isMethod = isMethod
  }

  async eval(graph: Graph, selfId: string) {
    let fn = FUNCTIONS[this.name]["function"]
    if (!fn) {
      return null
    }

    const namedArgs: { [name: string]: any } = {}
    const positionalArgs: any[] = []

    const evaledArgs = await Promise.all(
      this.args.map(async (arg) => [arg.name, await arg.eval(graph, selfId)])
    )

    for (const [name, value] of evaledArgs) {
      if (name === "") {
        positionalArgs.push(value)
      } else {
        namedArgs[name] = value
      }
    }

    return fn(graph, positionalArgs, namedArgs, selfId, this.isMethod)
  }

  getIdRefs(): string[] {
    const idMap: { [id: string]: boolean } = {}

    for (const arg of this.args) {
      for (const id of arg.getIdRefs()) {
        idMap[id] = true
      }
    }

    return Object.keys(idMap)
  }
}

class ArgumentNode implements AstNode {
  from: number
  to: number
  name: string
  exp: AstNode

  constructor(from: number, to: number, name: string, exp: AstNode = new UndefinedNode(to, to)) {
    this.from = from
    this.to = to
    this.name = name
    this.exp = exp
  }

  eval(graph: Graph, selfId: string): any {
    return this.exp.eval(graph, selfId)
  }

  getIdRefs(): string[] {
    return this.exp.getIdRefs()
  }
}

class IdRefNode implements AstNode {
  constructor(readonly from: number, readonly to: number, readonly id: string) {}

  eval(graph: Graph) {
    return promisify(getNode(graph, this.id))
  }

  getIdRefs(): string[] {
    return [this.id]
  }
}

class StringNode implements AstNode {
  constructor(readonly from: number, readonly to: number, readonly string: string) {}

  eval() {
    return promisify(this.string)
  }

  getIdRefs(): string[] {
    return []
  }
}

class NumberNode implements AstNode {
  from: number
  to: number
  number: number

  constructor(from: number, to: number, num: string) {
    this.from = from
    this.to = to
    this.number = parseFloat(num)
  }

  eval() {
    return promisify(this.number)
  }

  getIdRefs(): string[] {
    return []
  }
}

interface Bullet {
  key?: string // todo: implement key
  value: any[]
}

export async function evalBullet(graph: Graph, nodeId: string): Promise<Bullet | null> {
  const node = getNode(graph, nodeId)
  const match = formulaGrammar.match(node.value)

  if (!match.succeeded()) {
    return null
  }

  const astNodes = formulaSemantics(match).toAst()

  return {
    value: await Promise.all(astNodes.map((expr: AstNode) => expr.eval(graph, nodeId))),
  } as Bullet
}

export function getReferencedNodeIds(source: string): string[] {
  const match = formulaGrammar.match(source)

  if (!match.succeeded()) {
    return []
  }

  const idMap: { [id: string]: boolean } = {}

  const parts = formulaSemantics(match).toAst()

  for (const part of parts) {
    for (const id of part.getIdRefs()) {
      idMap[id] = true
    }
  }

  return Object.keys(idMap)
}

export function evalInlineExp(graph: Graph, source: string): Promise<any> {
  const match = formulaGrammar.match(source, "InlineExp")

  if (!match.succeeded()) {
    return Promise.reject("")
  }

  try {
    return formulaSemantics(match).toAst().eval(graph)
  } catch (err: any) {
    console.error(err.message)
    return Promise.reject(err.message)
  }
}

export function parseInlineExp(source: string): AstNode | undefined {
  const match = formulaGrammar.match(source, "InlineExp")

  if (!match.succeeded()) {
    return undefined
  }

  return formulaSemantics(match).toAst()
}

export function iterateOverArgumentNodes(node: AstNode, fn: (arg: ArgumentNode) => void) {
  if (node instanceof FnNode) {
    for (const arg of node.args) {
      iterateOverArgumentNodes(arg, fn)
    }
  }

  if (node instanceof ArgumentNode) {
    fn(node)
    iterateOverArgumentNodes(node.exp, fn)
  }
}

interface WeatherInformation {
  min: number
  max: number
}

async function getTemperature(
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

    const measurements = Object.values(dayGroup)

    for (const measurement of measurements) {
      totalMax += measurement.max
      totalMin += measurement.min
    }

    return {
      min: round(totalMin / measurements.length),
      max: round(totalMax / measurements.length),
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
      "&daily=temperature_2m_max,temperature_2m_min",
      "&forecast_days=16",
      `&timezone=${encodeURIComponent(currentTimezone)}`,
    ].join("")
  ).then((res) => res.json())

  const forecast = rawForecast.daily.time.map((time: string, index: number) => ({
    min: rawForecast.daily.temperature_2m_min[index],
    max: rawForecast.daily.temperature_2m_min[index],
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
      "&daily=temperature_2m_max,temperature_2m_min",
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

    const [year, month, day] = date.split("-")
    const dayGroupKey = `${month}-${day}`

    let dayGroup = historicWeather[dayGroupKey]

    if (!dayGroup) {
      dayGroup = historicWeather[dayGroupKey] = {}
    }

    dayGroup[year] = { min, max }
  }

  HISTORIC_WEATHER_CACHE[locationKey] = historicWeather

  return historicWeather
}
