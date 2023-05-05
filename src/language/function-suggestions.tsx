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
        if (arg.name === anchorArgument.name) {
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
        const childNode = createValueNode(graph, { value: formula, isTemporary: true })
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
  anchorArgument: AnchorArgument
  extractionFnForArgument: { [name: string]: (anchorScope: Scope) => string | undefined }
  fnParameters: { [name: string]: ParameterType }
}

function getPattern(formulaScope: Scope): Pattern | undefined {
  const inlineExpr = formulaScope.bullet.value[0]
  if (!(inlineExpr instanceof InlineExprNode) || !(inlineExpr.expr instanceof FnNode)) {
    return
  }

  const fn = inlineExpr.expr

  const fnParameters = FUNCTIONS[fn.name].parameters
  if (!fnParameters) {
    return
  }

  // find argument that ...
  //  1. maps to a parameter in the outline
  //  2. the parameter is a parent scope of a formula we want to generalize
  // todo: handle other relationships like siblings

  let anchorArgument = getAnchorArgument(formulaScope)

  if (!anchorArgument) {
    return
  }

  // map other arguments relative to this anchor argument
  // todo: handle complex case where bullet consists of multiple formulas

  const parametersInScope = sortBy(
    getParameters(anchorArgument.scope),
    (parameter) => parameter.distance
  )
  const relativeArguments: { [name: string]: (anchorScope: Scope) => string | undefined } = {}

  for (const argument of fn.args) {
    if (
      !(argument.exp instanceof IdRefNode) ||
      !argument.name ||
      argument.name === anchorArgument.name
    ) {
      continue
    }

    const argumentExpression = `#[${argument.exp.id}]`
    const parameter = parametersInScope.find((par) => par.value.expression === argumentExpression)

    // there are multiple ways to generalize patterns, right now we just have a single strategy for each relationship type
    if (parameter) {
      switch (parameter.relationship) {
        case "parent":
          // generalize to the closest parent relationship of that data type but allow other values in between

          relativeArguments[argument.name] = (scope) => {
            const matchingParent = scope.findParent(
              (parentScope) => parentScope.readAs(parameter.value.type)[0] !== undefined
            )

            return matchingParent ? matchingParent.source : undefined
          }
          break
        case "next":
          // only make sequential parameter relative if in the example there are no other siblings of the same type in between
          if (
            !isSiblingScopeOfTypeInBetween(
              parameter.scope,
              anchorArgument.scope,
              parameter.value.type
            )
          ) {
            // generalize to find the first next sibling of matching type
            relativeArguments[argument.name] = (scope) => {
              const parentScope = scope.parentScope

              if (!parentScope) {
                return
              }

              for (
                let index = parentScope.childScopes.indexOf(scope) + 1;
                index < parentScope.childScopes.length;
                index++
              ) {
                const prevScope = parentScope.childScopes[index]

                if (prevScope.readAs(parameter.value.type)[0] !== undefined) {
                  return prevScope.source
                }
              }

              return undefined
            }
          }

          break

        case "prev":
          // only make sequential parameter relative if in the example there are no other siblings of the same type in between
          if (
            !isSiblingScopeOfTypeInBetween(
              parameter.scope,
              anchorArgument.scope,
              parameter.value.type
            )
          ) {
            // generalize to find the first prev sibling of matching type
            relativeArguments[argument.name] = (scope) => {
              const parentScope = scope.parentScope

              if (!parentScope) {
                return
              }

              for (let index = parentScope.childScopes.indexOf(scope) - 1; index >= 0; index--) {
                const prevScope = parentScope.childScopes[index]

                if (prevScope.readAs(parameter.value.type)[0] !== undefined) {
                  return prevScope.source
                }
              }

              return undefined
            }
          }

          break
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

function isSiblingScopeOfTypeInBetween(scopeA: Scope, scopeB: Scope, type: ParameterType): boolean {
  if (
    scopeA.parentScope !== scopeB.parentScope ||
    scopeA.parentScope === undefined ||
    scopeB.parentScope === undefined
  ) {
    return false
  }

  const indexA = scopeA.parentScope.childScopes.indexOf(scopeA)
  const indexB = scopeA.parentScope.childScopes.indexOf(scopeB)

  const startIndex = Math.min(indexA, indexB) + 1
  const endIndex = Math.max(indexA, indexB)

  if (startIndex > endIndex) {
    return false
  }

  for (let i = startIndex; i < endIndex; i++) {
    if (scopeA.parentScope.childScopes[i].readAs(type)[0] !== undefined) {
      return true
    }
  }

  return false
}

interface AnchorArgument {
  type: ParameterType
  scope: Scope
  name: string
}

function getAnchorArgument(scope: Scope): AnchorArgument | undefined {
  const inlineExpr = scope.bullet.value[0]
  if (!(inlineExpr instanceof InlineExprNode) || !(inlineExpr.expr instanceof FnNode)) {
    return
  }

  const fn = inlineExpr.expr

  const fnParameters = FUNCTIONS[fn.name].parameters
  if (!fnParameters) {
    return
  }

  const parametersInScope = sortBy(getParameters(scope), (parameter) => parameter.distance)

  for (const argument of fn.args) {
    if (!(argument.exp instanceof IdRefNode) || !argument.name) {
      continue
    }

    const argumentExpression = `#[${argument.exp.id}]`
    const parameter = parametersInScope.find((par) => par.value.expression === argumentExpression)

    // todo: handle other insertion position like siblings
    if (parameter && parameter.scope === scope.parentScope) {
      return {
        name: argument.name,
        scope: parameter.scope,
        type: parameter.value.type,
      }
    }
  }
}

export function canFormulaBeRepeated(formulaScope: Scope): boolean {
  return getPattern(formulaScope) !== undefined
}
