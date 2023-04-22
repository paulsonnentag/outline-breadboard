import { Scope } from "../scopes"
import { FunctionComponent } from "react"

interface NamedArgs {
  [name: string]: any
}

interface ComputationSummaryView {
  value: any
}

export interface FunctionDef {
  function: (positionalArgs: any[], namedArgs: NamedArgs, scope: Scope) => any
  autocomplete?: {
    label: string
    value: string // the value that is inserted, use "$" to mark where cursor should be placed
  }
  summaryView?: (value: any) => HTMLElement | string
}
