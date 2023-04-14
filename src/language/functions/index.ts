import { DISTANCE_FN } from "./distance"
import { CORE_FNS } from "./core"
import { ROUTE_FN } from "./routes"
import { WEATHER_FN } from "./weather"
import { Scope } from "../dumb-scopes"

interface NamedArgs {
  [name: string]: any
}

export interface FunctionDef {
  function: (positionalArgs: any[], namedArgs: NamedArgs, scope: Scope) => any
  autocomplete?: {
    label: string
    value: string // the value that is inserted, use "$" to mark where cursor should be placed
  }
}

export interface FunctionDefs {
  [name: string]: FunctionDef
}

export const FUNCTIONS: FunctionDefs = {
  ...CORE_FNS,
  ...DISTANCE_FN,
  ...ROUTE_FN,
  ...WEATHER_FN,
}
