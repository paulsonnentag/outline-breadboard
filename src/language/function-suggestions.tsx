import { DataWithProvenance, Scope } from "./scopes"
import { FUNCTIONS } from "./functions"
import { sortBy } from "lodash"
import { ArgumentNode, FnNode, IdRefNode, InlineExprNode } from "./ast"
import { createValueNode, getNode, Graph } from "../graph"

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

export interface Insertion {
  parentId: string
  childId: string
}

// repeatFormula expects that graph is mutable
export function repeatFormula(graph: Graph, formulaScope: Scope): Insertion[] {
  const pattern = getPattern(formulaScope)

  if (!pattern) {
    return []
  }
  const { fnParameters, anchorArgument, fn, extractionFnForArgument } = pattern

  // go to root node and insert formula as a child node to any scope of matching type
  const rootScope = formulaScope.getRootScope()

  const requiredType = fnParameters[anchorArgument.name as string]

  const insertions: Insertion[] = []

  rootScope.traverseScope<undefined>(
    (scope) => {
      const value = scope.readAs(requiredType)[0]

      // abort if type of anchor scope doesn't match current scope
      if (value === undefined) {
        return
      }

      const argsSource = fn.args.map((arg) => {
        if (arg === anchorArgument) {
          return `${arg.name}: ${scope.source}`
        }

        const extractionFn = extractionFnForArgument[arg.name as string]
        if (extractionFn) {
          const value = extractionFn(scope)

          return value ? `${arg.name}: ${value}` : undefined
        }

        return `${arg.name}: #[${(arg.exp as IdRefNode).id}]`
      })

      // abort if some arguments couldn't be matched at this position in the outline abort
      if (argsSource.some((source) => source === undefined)) {
        return
      }

      const formula = `{${fn.name}(${argsSource.join(", ")})}`
      const doesAlreadyContainFormula = scope.childScopes.some((childScope) =>
        childScope.source.includes(formula)
      )

      if (!doesAlreadyContainFormula) {
        const node = getNode(graph, scope.id)
        const childNode = createValueNode(graph, { value: formula })
        node.children.push(childNode.id)

        insertions.push({ parentId: node.id, childId: childNode.id })
      }

      return undefined
    },
    undefined,
    { skipTranscludedScopes: true }
  )

  return insertions
}

// I'm not sure yet what a good shape for a pattern is
// for now it's just a collection of values that are needed for the repeated application of the formula
interface Pattern {
  fn: FnNode
  anchorArgument: ArgumentNode
  extractionFnForArgument: { [name: string]: (anchorScope: Scope) => string | undefined }
  fnParameters: { [name: string]: ParameterType }
}

function getPattern(formulaScope: Scope): Pattern | undefined {
  const parametersInScope = sortBy(getParameters(formulaScope), (parameter) => parameter.distance)

  const inlineExpr = formulaScope.bullet.value[0]
  if (!(inlineExpr instanceof InlineExprNode) || !(inlineExpr.expr instanceof FnNode)) {
    return
  }

  const fn = inlineExpr.expr

  const fnParameters = FUNCTIONS[fn.name].parameters
  if (!fnParameters) {
    console.log("doesn't have params")
    return
  }

  // match arguments to the closes parameter in the outline, some arguments might not occur in the outline
  // todo: handle complex case where bullet consists of multiple formulas

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

  // find argument that ...
  //  1. maps to a parameter in the outline
  //  2. the parameter is a parent scope of a formula we want to generalize
  // todo: handle other relationships like siblings

  let anchorArgument: ArgumentNode | undefined
  for (const argument of fn.args) {
    if (!argument.name) {
      continue
    }

    const parameter = parameterByArgument[argument.name]
    if (parameter && parameter.scope === formulaScope.parentScope) {
      anchorArgument = argument
      break
    }
  }

  if (!anchorArgument) {
    return
  }

  const relativeArguments: { [name: string]: (anchorScope: Scope) => string | undefined } = {}

  for (const argument of fn.args) {
    if (argument === anchorArgument || !argument.name || !parameterByArgument[argument.name]) {
      continue
    }

    const parameter = parameterByArgument[argument.name]

    // todo: turn other relationship types into relativeArguments as well
    if (parameter && parameter.relationship === "parent") {
      // this is not necessary what the user always wants, by default we generalize the closest parent relationship
      // of that data type and allow other values in between

      relativeArguments[argument.name] = (scope) => {
        const matchingParent = scope.findParent(
          (parentScope) => parentScope.readAs(parameter.value.type)[0] !== undefined
        )

        return matchingParent ? matchingParent.source : undefined
      }
    }
  }

  return {
    fn,
    fnParameters,
    anchorArgument,
    extractionFnForArgument: relativeArguments,
  }
}

export function canFormulaBeRepeated(formulaScope: Scope): boolean {
  return getPattern(formulaScope) !== undefined
}
