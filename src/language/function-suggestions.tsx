import { DataWithProvenance, Scope } from "./scopes"
import { FUNCTIONS } from "./functions"
import { sortBy } from "lodash"
import { FnNode, IdRefNode, InlineExprNode } from "./ast"

export interface FunctionSuggestion {
  name: string
  arguments: { label: string; value?: string }[]
  icon?: string
  rank?: number // lower number is better
}

export interface Parameter {
  relationship: "prev" | "next" | "parent" | "self"
  distance: number
  value: ParameterValue
  scope: Scope
}

export type ParameterType = "date" | "location" | "flight"

interface ParameterValue {
  expression: string
  type: ParameterType
}

export function getSuggestedFunctions(scope: Scope): FunctionSuggestion[] {
  const parameters: Parameter[] = getParameters(scope)

  const result = sortBy(
    Object.entries(FUNCTIONS).flatMap(([name, fn]) => {
      let suggestions: FunctionSuggestion[] = []

      if (fn.suggestions) {
        suggestions = suggestions.concat(fn.suggestions(parameters))
      }

      if (fn.autocomplete) {
        suggestions.push(fn.autocomplete)
      }

      return suggestions
    }),
    (suggestion: FunctionSuggestion) => suggestion.rank ?? Infinity
  )

  console.log(result)

  return result
}

interface GroupedFunctionSuggestions {
  [name: string]: FunctionSuggestion[]
}

export function getGroupedSuggestedFunctions(scope: Scope): GroupedFunctionSuggestions {
  const parameters: Parameter[] = getParameters(scope)
  const groups: GroupedFunctionSuggestions = {}

  Object.entries(FUNCTIONS).forEach(([name, fn]) => {
    if (fn.suggestions) {
      groups[name] = sortBy(fn.suggestions(parameters), (suggestion) => suggestion.rank ?? Infinity)
    }
  })

  return groups
}

export function getParameters(scope: Scope): Parameter[] {
  return getOwnParameters(scope)
    .concat(getSequentialParameters(scope))
    .concat(getParentParameters(scope))
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
      expression: `#[${date.scope.id}]`,
      type: "date",
    })
  }

  const location = scope.readAsLocation()[0]
  if (location) {
    values.push({
      expression: `#[${location.scope.id}]`,
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

function getParentParameters(scope: Scope): Parameter[] {
  const parameters: Parameter[] = []
  _getParentParameters(scope, 1, parameters)
  return parameters
}

function _getParentParameters(scope: Scope, distance: number, parameters: Parameter[] = []) {
  const parentScope = scope.parentScope

  if (!parentScope) {
    return
  }

  for (const value of parseValuesInScope(parentScope)) {
    parameters.push({
      distance,
      relationship: "parent",
      scope: parentScope,
      value,
    })
  }

  if (parentScope.parentScope) {
    _getParentParameters(parentScope, distance + 1, parameters)
  }
}

// todo: handle expressions with mixed in text

export function generalizeFormula(scope: Scope) {
  const parametersInScope = sortBy(getParameters(scope), (parameter) => parameter.distance)

  console.log("generalize")

  const inlineExpr = scope.bullet.value[0]
  if (!(inlineExpr instanceof InlineExprNode) || !(inlineExpr.expr instanceof FnNode)) {
    return
  }

  const fn = inlineExpr.expr

  const fnParameters = FUNCTIONS[fn.name].parameters
  if (!fnParameters) {
    console.log("doesn't have params")
    return
  }

  // todo: handle complex case where bullet consists of multiple formulas

  // get the closest parameter it's related to

  const parameterByArgument: { [name: string]: Parameter } = {}
  for (const argument of fn.args) {
    if (!(argument.exp instanceof IdRefNode) || !argument.name) {
      continue
    }

    const argumentExpression = `#[${argument.exp.id}]`
    const parameter = parametersInScope.find((par) => par.value.expression === argumentExpression)

    if (parameter) {
      parameterByArgument[argument.name] = parameter
    }
  }

  console.log(parameterByArgument)
}
