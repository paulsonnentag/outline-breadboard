import { StateEffect, StateField } from "@codemirror/state"
import { Decoration, EditorView, WidgetType } from "@codemirror/view"
import { FUNCTIONS } from "../../language/functions"
import classNames from "classnames"
import { getGraphDocHandle, getNode } from "../../graph"
import { Scope } from "../../language/scopes"
import { FnNode } from "../../language/ast"

//  listed here, so they will be included in the tailwind build
const COLOR_CLASSES = [
  "text-red-700",
  "text-orange-700",
  "text-yellow-700",
  "text-green-700",
  "text-blue-700",
  "text-purple-700",
  "text-pink-700",
  "hover:bg-red-200",
  "hover:bg-orange-200",
  "hover:bg-yellow-200",
  "hover:bg-green-200",
  "hover:bg-blue-200",
  "hover:bg-purple-200",
  "hover:bg-pink-200",
  "bg-red-200",
  "bg-orange-200",
  "bg-yellow-200",
  "bg-green-200",
  "bg-blue-200",
  "bg-purple-200",
  "bg-pink-200",
]

class ExpressionResultWidget extends WidgetType {
  readonly nodeId: string
  readonly isExpanded: boolean
  readonly color: string
  readonly value: any
  readonly index: number
  readonly functionName?: string

  constructor(props: ExpressionResult) {
    super()

    this.nodeId = props.nodeId
    this.isExpanded = props.isExpanded
    this.color = props.color
    this.value = props.value
    this.index = props.index
    this.functionName = props.functionName
  }

  eq(other: ExpressionResultWidget) {
    return (
      this.nodeId === other.nodeId &&
      this.color === other.color &&
      this.value === other.value &&
      this.functionName === other.functionName &&
      this.index === other.index
    )
  }

  toDOM() {
    const container = document.createElement("span")
    const summaryView = this.functionName && FUNCTIONS[this.functionName].summaryView
    const isExpandable = summaryView || typeof this.value === "object"

    container.className = `ml-2 text-${this.color}-600 `
    container.append("= ")

    if (!this.isExpanded) {
      const valueElement = document.createElement("span")
      valueElement.className = classNames("px-1 rounded", {
        [`border border-${this.color}-200`]: isExpandable,
        [`hover:bg-${this.color}-200`]: isExpandable,
      })

      const summaryElement = summaryView ? summaryView(this.value) : valueToString(this.value)
      valueElement.append(summaryElement)
      container.append(valueElement)

      if (isExpandable) {
        valueElement.addEventListener("click", () => {
          getGraphDocHandle().change(({ graph }) => {
            const node = getNode(graph, this.nodeId)
            node.expandedResultsByIndex[this.index] = true
          })

          valueElement.remove()
        })
      }
    }

    return container
  }

  ignoreEvent() {
    return true
  }
}

export function valueToString(x: any): string {
  if (x === undefined) {
    return ""
  }

  if (typeof x === "object" && x !== null && !(x instanceof Array)) {
    // special property that defines a custom summary value
    if (x.__summary) {
      return x.__summary
    }

    const keyValuePairs: string[] = []

    for (const [key, value] of Object.entries(x)) {
      if (value === undefined) {
        continue
      }

      const stringValue = typeof value === "object" ? "{...}" : JSON.stringify(value)

      keyValuePairs.push(`${key}: ${stringValue}`)
    }

    return keyValuePairs.join(" ")
  }

  return JSON.stringify(x)
}

export interface ExpressionResult {
  nodeId: string
  isExpanded: boolean
  color: string
  value: any
  index: number
  functionName?: string
  positionInSource: number
}

export const setExpressionResultsEffect = StateEffect.define<ExpressionResult[]>()
export const expressionResultsField = StateField.define<ExpressionResult[]>({
  create() {
    return []
  },
  update(expressionResults, tr) {
    for (let e of tr.effects) {
      if (e.is(setExpressionResultsEffect)) {
        return e.value
      }
    }
    return expressionResults.map((expressionResult) => {
      return {
        ...expressionResult,
        positionInSource: tr.changes.mapPos(expressionResult.positionInSource),
      }
    })
  },
})

export const expressionResultsDecorations = EditorView.decorations.compute(
  [expressionResultsField],
  (state) => {
    const expressionResults = state.field(expressionResultsField)

    return Decoration.set(
      expressionResults.map((expressionResult) =>
        Decoration.widget({
          widget: new ExpressionResultWidget(expressionResult),
          side: 1,
        }).range(expressionResult.positionInSource)
      )
    )
  }
)
