import { Scope } from "./scopes"
import { parseDate, parseLatLng } from "../properties"
import { FUNCTIONS } from "./functions"
import { sortBy } from "lodash"

export interface FunctionSuggestion {
  expression: string
  name: string
  rank?: number // lower number is better
}

export interface Parameter {
  relationship: "prev" | "next" | "parent" | "self"
  distance: number
  value: ParameterValue
  scope: Scope
}

interface ParameterValue {
  expression: string
  type: "date" | "location"
}

export function getSuggestedFunctions(scope: Scope): FunctionSuggestion[] {
  const parameters: Parameter[] = getParameters(scope)

  return sortBy(
    Object.entries(FUNCTIONS).flatMap(([name, fn]) => {
      let suggestions: FunctionSuggestion[] = []

      if (fn.suggestions) {
        suggestions = suggestions.concat(fn.suggestions(parameters))
      }

      if (fn.autocomplete) {
        suggestions.push({
          name,
          expression: fn.autocomplete.value,
        })
      }

      return suggestions
    }),
    (suggestion) => suggestion.rank || Infinity
  )
}

export function getParameters(scope: Scope): Parameter[] {
  return getOwnParameters(scope).concat(getSequentialParameters(scope))
}

function getOwnParameters(scope: Scope): Parameter[] {
  return parseValuesInScope(scope).map((value) => ({
    relationship: "self",
    distance: 0,
    value,
    scope,
  }))
}

// todo: support multiple values
function parseValuesInScope(scope: Scope): ParameterValue[] {
  const values: ParameterValue[] = []

  const date = scope.readAsDate()[0]
  if (date) {
    values.push({
      expression: scope.source,
      type: "date",
    })
  }

  const location = scope.readAsLocation()[0]
  if (location) {
    values.push({
      expression: scope.source,
      type: "location",
    })
  }

  return values
}

function getSequentialParameters(scope: Scope): Parameter[] {
  const parent = scope.parentScope

  if (!parent) {
    return []
  }

  const index = parent.childScopes.indexOf(scope)

  const parameters: Parameter[] = []

  let distance = 1
  let prevScope, nextScope
  do {
    prevScope = parent.childScopes[index - distance]
    if (prevScope) {
      const values = parseValuesInScope(prevScope)

      for (const value of values) {
        parameters.push({
          relationship: "prev",
          distance,
          value,
          scope: prevScope,
        })
      }
    }

    nextScope = parent.childScopes[index + distance]
    if (nextScope) {
      const values = parseValuesInScope(nextScope)

      for (const value of values) {
        parameters.push({
          relationship: "next",
          distance,
          value,
          scope: nextScope,
        })
      }
    }

    distance += 1
  } while (prevScope || nextScope)

  return parameters
}
