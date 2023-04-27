import { Scope } from "../scopes"
import { FunctionSuggestion, Parameter } from "../function-suggestions"

interface NamedArgs {
  [name: string]: any
}

export interface FunctionDef {
  function: (positionalArgs: any[], namedArgs: NamedArgs, scope: Scope) => any
  autocomplete?: {
    label: string
    value: string // the value that is inserted, use "$" to mark where cursor should be placed
  }
  summaryView?: (value: any) => HTMLElement | string
  suggestions?: (parameters: Parameter[]) => FunctionSuggestion[]
}

export interface FunctionDefs {
  [name: string]: FunctionDef
}

// you should only return this value if the parameters are missing not if they are invalid
export const HAS_MISSING_ARGUMENTS_VALUE = Symbol("hasMissingArguments")
