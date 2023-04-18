import { DISTANCE_FN } from "./distance"
import { CORE_FNS } from "./core"
import { ROUTE_FN } from "./routes"
import { WEATHER_FN } from "./weather"
import { ComputationResult, Scope, useUpdateHandler } from "../scopes"
import { useState } from "react"
import { FunctionDef } from "./function-def"

export interface FunctionDefs {
  [name: string]: FunctionDef
}

export const FUNCTIONS: FunctionDefs = {
  ...CORE_FNS,
  ...DISTANCE_FN,
  ...ROUTE_FN,
  ...WEATHER_FN,
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

  return (
    <div>
      {computationResults.map((result, index) => {
        const View = FUNCTIONS[result.name].summaryView

        if (View) {
          return <View value={result.data} key={index} />
        }
      })}
    </div>
  )
}
