import { Scope } from "../scopes"
import { FunctionSuggestion, Parameter, ParameterType } from "../function-suggestions"

interface NamedArgs {
  [name: string]: any
}

export interface FunctionDef {
  function: (positionalArgs: any[], namedArgs: NamedArgs, scope: Scope) => any
  autocomplete?: FunctionSuggestion
  summaryView?: (value: any) => string
  suggestions?: (parameters: Parameter[]) => FunctionSuggestion[]
  icon?: string
  parameters?: { [name: string]: ParameterType }
}

export interface FunctionDefs {
  [name: string]: FunctionDef
}

// you should only return this value if the parameters are missing not if they are invalid
export const HAS_MISSING_ARGUMENTS_VALUE = Symbol("hasMissingArguments")
