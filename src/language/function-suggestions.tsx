import { Scope } from "./scopes"
import { FUNCTIONS } from "./functions"
import { sortBy } from "lodash"
import { FnNode, IdRefNode, InlineExprNode } from "./ast"
import { createValueNode, getNode, Graph } from "../graph"

export interface FunctionSuggestion {
  name: string
  arguments: { label: string; expression?: string; value?: any }[]
  icon?: string
  rank?: number // lower number is better
}

export interface Parameter {
  relationship: "prev" | "next" | "parent" | "self"
  distance: number
  value: ParameterValue
}

export type ParameterType = "date" | "location" | "flight"

interface ParameterValue {
  scope: Scope
  expression: string
  value: any
  type: ParameterType
}

export interface FunctionSuggestionWithText extends FunctionSuggestion {
  text: string
}

export function getSuggestedFunctions(scope: Scope, graph: Graph): FunctionSuggestionWithText[] {
  const parameters: Parameter[] = getParameters(scope)

  const result = sortBy(
    Object.entries(FUNCTIONS)
      .flatMap(([name, fn]) => {
        let suggestions: FunctionSuggestion[] = []

        if (fn.suggestions) {
          suggestions = suggestions.concat(fn.suggestions(parameters))
        }

        if (fn.autocomplete) {
          suggestions.push(fn.autocomplete)
        }

        return suggestions
      })
      .map((suggestion) => {
        const functionText = `${suggestion.name} ${suggestion.arguments
          .map((arg) => {
            if (!arg.value) {
              return `${arg.label}: `
            }
            // assume value is a id ref like `#[....]`
            const id = arg.value.slice(2, -1)
            return `${arg.label}: ${getNode(graph, id).value}`
          })
          .join(", ")}`

        return { ...suggestion, text: functionText } as FunctionSuggestionWithText
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
  const uniqueParameters: { [value: string]: Parameter } = {}

  const parameters = getOwnParameters(scope)
    .concat(getSequentialParameters(scope))
    .concat(getParentParameters(scope))

  for (const parameter of parameters) {
    const existingParam = uniqueParameters[parameter.value.expression]

    if (!existingParam || existingParam.distance > parameter.distance) {
      uniqueParameters[parameter.value.expression] = parameter
    }
  }

  return Object.values(uniqueParameters)
}

function getOwnParameters(scope: Scope): Parameter[] {
  return parseValuesInScope(scope).map((value) => ({
    relationship: "self",
    distance: 0,
    value,
    scope,
  }))
}

function parseValuesInScope(scope: Scope): ParameterValue[] {
  const values: ParameterValue[] = []

  const dates = scope.readAsDate()
  for (const date of dates) {
    values.push({
      expression: `#[${date.scope.id}]`,
      value: date.data,
      type: "date",
      scope,
    })
  }

  const locations = scope.readAsLocation()
  for (const location of locations) {
    values.push({
      expression: `#[${location.scope.id}]`,
      value: location.data,
      type: "location",
      scope,
    })
  }

  return values
}

export function getSequentialParameters(scope: Scope): Parameter[] {
  if (!scope.parentScope) {
    return []
  }

  const beforeValues: ParameterValue[] = []
  const afterValues: ParameterValue[] = []

  const splitIndex = scope.parentScope.childScopes.indexOf(scope)

  extractSequentialParameterValuesOfSubtree(scope, afterValues)
  extractSequentialParameters(scope, splitIndex, beforeValues, afterValues)

  /*console.log({
    before: before.map((p, index) => {
      return {
        value: getNode(graph, p.expression.slice(2, -1)).value,
        distance: before.length - index,
      }
    }),
    after: after.map((p, index) => {
      return {
        relationship: "next",
        value: getNode(graph, p.expression.slice(2, -1)).value,
        distance: index + 1,
      }
    }),
  })*/

  const parameters: Parameter[] = []

  beforeValues.forEach((value, index) => {
    parameters.push({
      value,
      distance: beforeValues.length - index,
      relationship: "prev",
    })
  })

  afterValues.forEach((value, index) => {
    parameters.push({
      value,
      distance: index + 1,
      relationship: "next",
    })
  })

  return parameters
}

function extractSequentialParameters(
  scope: Scope,
  splitIndex: number,
  before: ParameterValue[],
  after: ParameterValue[]
) {
  for (let index = 0; index < scope.childScopes.length; index++) {
    if (index === splitIndex) {
      continue
    }

    const childScope = scope.childScopes[index]

    extractSequentialParameterValuesOfSubtree(childScope, index < splitIndex ? before : after)
  }

  if (scope.parentScope) {
    const parentSplitIndex = scope.parentScope.childScopes.indexOf(scope)
    extractSequentialParameters(scope.parentScope, parentSplitIndex, before, after)

    before.unshift(...parseValuesInScope(scope.parentScope))
  }
}

function extractSequentialParameterValuesOfSubtree(scope: Scope, values: ParameterValue[]) {
  values.push(...parseValuesInScope(scope))

  for (const childScope of scope.childScopes) {
    extractSequentialParameterValuesOfSubtree(childScope, values)
  }
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
          const refId = (scope.bullet.value[value.index as number] as IdRefNode).id
          return `${arg.name}: #[${refId}]`
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

      switch (anchorArgument.outputPosition) {
        case "above":
        case "below": {
          if (!scope.parentScope) {
            return
          }

          const doesAlreadyContainFormula = scope.parentScope.childScopes.some((childScope) =>
            childScope.source.includes(formula)
          )

          if (!doesAlreadyContainFormula) {
            const node = getNode(graph, scope.parentScope.id)
            const insertionIndex =
              node.children.indexOf(scope.id) + (anchorArgument.outputPosition === "below" ? 1 : 0)

            const childNode = createValueNode(graph, { value: formula, isTemporary: true })
            node.children.splice(insertionIndex, 0, childNode.id)
            insertions.push({ parentId: node.id, childId: childNode.id })
          }
          break
        }
        case "child": {
          const doesAlreadyContainFormula = scope.childScopes.some((childScope) =>
            childScope.source.includes(formula)
          )

          if (!doesAlreadyContainFormula) {
            const node = getNode(graph, scope.id)
            const childNode = createValueNode(graph, { value: formula, isTemporary: true })
            node.children.push(childNode.id)

            insertions.push({ parentId: node.id, childId: childNode.id })
          }
        }
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

  const fnParameters = FUNCTIONS[fn.name]?.parameters
  if (!fnParameters) {
    return
  }

  // find argument node that formula is attached to in outline and use that as an anchor
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

            if (!matchingParent) {
              return undefined
            }

            // todo: handle multiple matching values
            return `#[${matchingParent.readAs(parameter.value.type)[0].scope.id}]`
          }
          break
        case "next":
          // only make sequential parameter relative if in the example there are no other siblings of the same type in between
          if (
            !isSiblingScopeOfTypeInBetween(
              parameter.value.scope,
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
                const nextScope = parentScope.childScopes[index]
                const nextScopeValue = nextScope.readAs(parameter.value.type)[0]

                if (nextScopeValue !== undefined) {
                  return `#[${nextScopeValue.scope.id}]`
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
              parameter.value.scope,
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

                const prevScopeValue = prevScope.readAs(parameter.value.type)[0]

                if (prevScopeValue !== undefined) {
                  return `#[${prevScopeValue.scope.id}]`
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
  const indexB = scopeB.parentScope.childScopes.indexOf(scopeB)

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

type AnchorOutputPosition = "above" | "below" | "child"

interface AnchorArgument {
  type: ParameterType
  scope: Scope
  expression: string
  name: string
  outputPosition: AnchorOutputPosition
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

    if (!parameter) {
      continue
    }

    const outputPosition = getOutputPosition(parameter.value.scope, scope)

    if (outputPosition) {
      return {
        name: argument.name,
        expression: argumentExpression,
        scope: parameter.value.scope,
        type: parameter.value.type,
        outputPosition,
      }
    }
  }
}

function getOutputPosition(
  anchorScope: Scope,
  outputScope: Scope
): AnchorOutputPosition | undefined {
  if (outputScope.parentScope === anchorScope) {
    return "child"
  }

  if (
    anchorScope.parentScope !== outputScope.parentScope ||
    anchorScope.parentScope === undefined ||
    outputScope.parentScope === undefined
  ) {
    return
  }

  const anchorIndex = anchorScope.parentScope.childScopes.indexOf(anchorScope)
  const outputIndex = outputScope.parentScope.childScopes.indexOf(outputScope)

  if (anchorIndex + 1 == outputIndex) {
    return "below"
  }

  if (anchorIndex - 1 == outputIndex) {
    return "above"
  }
}

export function canFormulaBeRepeated(formulaScope: Scope): boolean {
  return getPattern(formulaScope) !== undefined
}
