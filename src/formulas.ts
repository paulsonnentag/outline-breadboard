import * as ohm from "ohm-js"
import { getGraphDocHandle, getNode, Graph, ValueNode } from "./graph"
import { readLatLng, readProperty } from "./properties"
import { point as turfPoint } from "@turf/helpers"
import turfDistance from "@turf/distance"
import LatLngLiteral = google.maps.LatLngLiteral
import { googleApi } from "./google"
import DirectionsResult = google.maps.DirectionsResult

// An object to store results of calling functions
const functionCache: { [key: string]: any } = {}

const GRAMMAR_SRC = `
Node {
  Bullet
    = Text
    
  Text
    = TextPart+

  TextPart
    = TextLiteral
    | InlineExp

  InlineExp
    = "{" Exp "}"

  Property
    = Key ":" Text

  ComputedProperty
    = Key "=" Exp

  Key
    = PropertyChar+

  TextLiteral = textChar+

  textChar
    = ~"{" any

  Exp = AddExp
  
  SimpleExp
    = AccessExp
    | FunctionExp
    | StringLiteral
    | NumberLiteral
    | IdRef

  AccessExp
    = SimpleExp "." PropertyName

  PropertyName
    = PropertyChar+

  PropertyChar
    = alnum+ | "_"

  StringLiteral
    = "\\"" StringChar+ "\\""

  NumberLiteral
    = digit+

  IdRefChar
    = alnum+ | "_" | "-"

  IdRef
    = "#[" IdRefChar+ "]"

  StringChar
    = alnum | "." | ":" | ">" | "-" | "(" | ")" | "[" | "]" | "=" | "'" | "/" | "*" | "!" | "$" | "_"

  FunctionExp
    = letter+ "(" ListOf<Argument, ","> ")"
        
  Argument = (Key ":")? Exp

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
  function: (graph: Graph, positionalArgs: any[], namedArgs: { [name: string]: any }) => any
  arguments?: {
    [arg: string]: string
  }
  description?: string
  autocomplete?: {
    label: string
    value: string // the value that is inserted, use "$" to mark where cursor should be placed
  }
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

  return {
    distance: route.legs[0].distance?.text,
    duration: route.legs[0].duration?.text,
    geometry: {
      type: "FeatureCollection",

      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: route.overview_path.map(({ lat, lng }) => [lng, lat]),
          },
        },
      ],
    },
  }
}

export const FUNCTIONS: { [name: string]: FunctionDef } = {
  Route: {
    function: async (graph, _, { from, to }) => {
      if (!from || !from.id || !to || !to.id) {
        return
      }

      const pos1 = readLatLng(graph, from.id)
      const pos2 = readLatLng(graph, to.id)

      if (!pos1 || !pos2) {
        return undefined
      }

      const graphDocHandle = getGraphDocHandle()
      const doc = await graphDocHandle.value()

      const key = `${pos1.lat}:${pos1.lng}/${pos2.lat}:${pos2.lng}`
      const cachedResult: DirectionsResult = doc.cache[key] ? JSON.parse(doc.cache[key]) : undefined

      if (cachedResult) {
        return directionsResultToRoute(cachedResult)
      }

      const directionsService = await directionsServiceApi

      return new Promise((resolve, reject) => {
        console.log("fetch route")

        directionsService.route(
          {
            origin: pos1,
            destination: pos2,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result: google.maps.DirectionsResult | null) => {
            result = result ?? { routes: [] }

            graphDocHandle.change((graphDoc) => {
              graphDoc.cache[key] = JSON.stringify(result) // store it as string, because otherwise it takes a long time to write it into automerge
            })

            resolve(directionsResultToRoute(result))
          }
        )
      })
    },

    autocomplete: {
      label: "Route",
      value: "{Route(from:$, to:)}",
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

      return `${Math.round(distance)} ${unitShortName(unit)}`
    },

    autocomplete: {
      label: "Distance",
      value: "{Distance(from:$, to:)}",
    },
  },

  Get: {
    function: (graph, [object, key]) => {
      if (!object || !object.children || !key) {
        return undefined
      }

      return promisify(readProperty(graph, object.id, key))
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
  TextLiteral: (e) => new StringNode(e.sourceString),

  Exp: (e) => e.toAst(),

  SimpleExp: (e) => e.toAst(),
  InlineExp: (_, e, __) => {
    return e.toAst()
  },

  FunctionExp: (fnName, _p1, args, _p2) => {
    console.log("heyo")
    console.log(args.asIteration().toAst())

    return new FnNode(fnName.sourceString, args.asIteration().toAst())
  },

  Argument: (name, _, exp) => {
    return new ArgumentNode(name.sourceString.slice(0, -1), exp.toAst())
  },

  IdRef: (fo, chars, bar) => new IdRefNode(chars.sourceString),
  StringLiteral: function (_q1, string, _q2) {
    return new StringNode(string.sourceString)
  },
  NumberLiteral: (num) => new NumberNode(num.sourceString),
  MulExp_times: (a, _, b) =>
    new FnNode(
      "Multiply",
      [a, b].map((x) => x.toAst())
    ),
  MulExp_divide: (a, _, b) =>
    new FnNode(
      "Divide",
      [a, b].map((x) => x.toAst())
    ),
  AddExp_plus: (a, _, b) =>
    new FnNode(
      "Plus",
      [a, b].map((x) => x.toAst())
    ),
  AddExp_minus: (a, _, b) =>
    new FnNode(
      "Minus",
      [a, b].map((x) => x.toAst())
    ),

  AccessExp: (obj, _, key) =>
    new FnNode(
      "Get",
      [obj, key].map((x) => x.toAst())
    ),

  PropertyName: (name) => new StringNode(name.sourceString),

  _iter: (...args) => args.map((arg) => arg.toAst()),
})

interface AstNode {
  eval: (graph: Graph) => any
  getIdRefs: () => string[]
}

class FnNode implements AstNode {
  name: string
  positionalArgs: AstNode[]
  namedArgs: { [name: string]: AstNode }

  constructor(fnName: string, args: AstNode[]) {
    this.name = fnName

    this.positionalArgs = []
    this.namedArgs = {}

    for (const arg of args) {
      if (arg instanceof ArgumentNode) {
        if (arg.name) {
          this.namedArgs[arg.name] = arg.exp
        } else {
          this.positionalArgs.push(arg.exp)
        }
      } else {
        this.positionalArgs.push(arg)
      }
    }
  }

  async eval(graph: Graph) {
    let fn = FUNCTIONS[this.name]["function"]
    if (!fn) {
      return null
    }

    const positionalArgs = await Promise.all(this.positionalArgs.map((arg) => arg.eval(graph)))
    const namedArgs = (
      await Promise.all(
        Object.entries(this.namedArgs).map(async ([name, value]) => [name, await value.eval(graph)])
      )
    ).reduce((argMap: { [name: string]: any }, [name, value]) => {
      argMap[name] = value
      return argMap
    }, {})

    return fn(graph, positionalArgs, namedArgs)
  }

  getIdRefs(): string[] {
    const idMap: { [id: string]: boolean } = {}

    for (const arg of this.positionalArgs.concat(Object.values(this.namedArgs))) {
      for (const id of arg.getIdRefs()) {
        idMap[id] = true
      }
    }

    return Object.keys(idMap)
  }
}

class ArgumentNode implements AstNode {
  name: string
  exp: AstNode

  constructor(name: string, exp: AstNode) {
    this.name = name
    this.exp = exp
  }

  eval(graph: Graph): any {
    return this.exp.eval(graph)
  }

  getIdRefs(): string[] {
    return []
  }
}

class IdRefNode implements AstNode {
  constructor(readonly id: string) {}

  eval(graph: Graph) {
    return promisify(getNode(graph, this.id))
  }

  getIdRefs(): string[] {
    return [this.id]
  }
}

class StringNode implements AstNode {
  constructor(readonly string: string) {}

  eval(graph: Graph) {
    return promisify(this.string)
  }

  getIdRefs(): string[] {
    return []
  }
}

class NumberNode implements AstNode {
  number: number

  constructor(num: string) {
    this.number = parseFloat(num)
  }

  eval(graph: Graph) {
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

export async function evalBullet(graph: Graph, source: string): Promise<Bullet | null> {
  const match = formulaGrammar.match(source)

  if (!match.succeeded()) {
    return null
  }

  return {
    value: await Promise.all(
      formulaSemantics(match)
        .toAst()
        .map((expr: AstNode) => expr.eval(graph))
    ),
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
    return Promise.resolve(null)
  }

  try {
    return formulaSemantics(match).toAst().eval(graph)
  } catch {
    return Promise.resolve(null)
  }
}
