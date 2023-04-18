import { DISTANCE_FN } from "./distance"
import { CORE_FNS } from "./core"
import { ROUTE_FN } from "./routes"
import { WEATHER_FN } from "./weather"
import { ComputationResult, Scope, useUpdateHandler } from "../scopes"
import { FunctionComponent, useState } from "react"

interface NamedArgs {
  [name: string]: any
}

export interface FunctionDef {
  function: (positionalArgs: any[], namedArgs: NamedArgs, scope: Scope) => any
  autocomplete?: {
    label: string
    value: string // the value that is inserted, use "$" to mark where cursor should be placed
  }
  summaryView?: FunctionComponent<ComputationSummaryView>
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

interface ComputationSummaryView {
  data: any
}

interface ComputationsSummaryViewProps {
  scope: Scope
}

export function ComputationResultsSummaryView({ scope }: ComputationsSummaryViewProps) {
  const [computationResults, setComputationResults] = useState<ComputationResult[]>([])

  useUpdateHandler(scope, (scope) => {
    setComputationResults(scope.computationResults)
  })

  if (computationResults.length === 0) {
    return null
  }

  return <div className="text-gray-300">{JSON.stringify(computationResults)}</div>
}
