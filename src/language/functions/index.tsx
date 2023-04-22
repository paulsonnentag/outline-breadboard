import { DISTANCE_FN } from "./distance"
import { CORE_FNS } from "./core"
import { ROUTE_FN } from "./routes"
import { WEATHER_FN } from "./weather"
import { ComputationResult, Scope, useUpdateHandler } from "../scopes"
import { useState } from "react"
import { FunctionDefs } from "./function-def"

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
  const [computationResults, setComputationResults] = useState<ComputationResult[]>(
    scope.computationResults
  )

  useUpdateHandler(scope, (scope) => {
    setComputationResults(scope.computationResults)
  })

  if (computationResults.length === 0) {
    return null
  }

  return (
    <div>
      {computationResults.map((result, index) => (
        <div
          className="rounded bg-gray-100 border border-gray-200 w-fit px-1 flex gap-1"
          key={index}
        >
          <span>{result.name.toLowerCase()}:</span>
          <ComputationSummaryView functionName={result.name} value={result.data} />
        </div>
      ))}
    </div>
  )
}

interface ComputationSummaryViewProps {
  functionName: string
  value: any
}

export function ComputationSummaryView({ functionName, value }: ComputationSummaryViewProps) {
  const view = FUNCTIONS[functionName].summaryView

  return view ? <span>view(value)</span> : <span>{JSON.stringify(value)}</span>
}
