import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { FnNode, InlineExprNode, isLiteral } from "../../language/ast"
import { scopeFacet } from "./state"
import {
  ComputationSummaryView,
  FUNCTIONS,
  HAS_MISSING_ARGUMENTS_VALUE,
} from "../../language/functions"
import { getGraphDocHandle, getNode } from "../../graph"
import { createRoot } from "react-dom/client"
import { Scope } from "../../language/scopes"
import classNames from "classnames"
import colors from "../../colors"

export const bulletEvalPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = getBulletDecorations(view)
    }

    update(update: ViewUpdate) {
      this.decorations = getBulletDecorations(update.view)
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)

function getBulletDecorations(view: EditorView): DecorationSet {
  const scope = view.state.facet(scopeFacet)

  if (!scope) {
    return Decoration.set([])
  }

  const decorations = scope.bullet.value.flatMap((part, index) => {
    if (part instanceof InlineExprNode) {
      const decorations = [
        Decoration.mark({
          class: "text-gray-300 inline-expr start",
        }).range(part.from, part.from + 1),
      ]
        .concat(
          part.to - part.from > 2
            ? Decoration.mark({
                class: "inline-expr middle",
              }).range(part.from + 1, part.to - 1)
            : []
        )
        .concat(
          Decoration.mark({
            class: "text-gray-300 inline-expr end",
          }).range(part.to - 1, part.to)
        )

      if (!isLiteral(part.expr)) {
        const value = scope.valueOf(index)
        const name = part.expr instanceof FnNode ? part.expr.name : undefined

        if (value !== undefined && value !== HAS_MISSING_ARGUMENTS_VALUE) {
          decorations.push(
            Decoration.widget({
              widget: new ResultOutputWidget(scope, index, name),
              side: 1,
            }).range(part.to)
          )
        }
      }

      return decorations
    }

    return []
  })

  return Decoration.set(decorations)
}

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

class ResultOutputWidget extends WidgetType {
  constructor(readonly scope: Scope, readonly index: number, readonly functionName?: string) {
    super()
  }

  eq(other: ResultOutputWidget) {
    return this.scope === other.scope && this.index === other.index
  }

  toDOM() {
    const container = document.createElement("span")

    const color = this.scope.lookup("color") ?? "purple"
    const value = this.scope.valueOf(this.index)
    const summaryView = this.functionName && FUNCTIONS[this.functionName].summaryView
    const isExpandable = summaryView || typeof value === "object"
    const isExpanded = this.scope.expandedResultsByIndex[this.index]

    container.className = `ml-2 text-${color}-600 `
    container.append("= ")

    if (!isExpanded) {
      const valueElement = document.createElement("span")
      valueElement.className = classNames("px-1 rounded", {
        [`border border-${color}-200`]: isExpandable,
        [`hover:bg-${color}-200`]: isExpandable && !isExpanded,
        [`bg-${color}-200`]: isExpanded,
      })

      const summaryElement = summaryView ? summaryView(value) : valueToString(value)
      valueElement.append(summaryElement)
      container.append(valueElement)

      if (isExpandable) {
        valueElement.addEventListener("click", () => {
          getGraphDocHandle().change(({ graph }) => {
            const node = getNode(graph, this.scope.id)
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

interface ResultViewProps {
  index: number
  scope: Scope
  functionName?: string
}

function ResultView({ index, scope, functionName }: ResultViewProps) {
  const isExpanded = scope.expandedResultsByIndex[index]

  const toggleIsExpanded = () => {}

  const value = scope.valueOf(index)
  const isExpandable = functionName && FUNCTIONS[functionName].summaryView
  const summary = functionName ? (
    <ComputationSummaryView functionName={functionName} value={value} />
  ) : (
    valueToString(value)
  )

  if (isExpanded) {
    return (
      <span className="ml-4">
        =
        <pre
          className="bg-purple-200 rounded p-1 text-purple-600 mt-1"
          onClick={() => toggleIsExpanded()}
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      </span>
    )
  }

  return (
    <span>
      ={" "}
      <div
        className={classNames("rounded text-purple-600 w-fit px-1", {
          "hover:bg-purple-200 border border-purple-200": isExpandable,
        })}
        onClick={() => {
          if (isExpandable) {
            toggleIsExpanded()
          }
        }}
      >
        {summary}
      </div>
    </span>
  )
}

function valueToString(x: any): string {
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
