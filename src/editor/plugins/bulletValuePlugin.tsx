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
        Decoration.mark({
          class: "inline-expr middle",
        }).range(part.from + 1, part.to - 1),
        Decoration.mark({
          class: "text-gray-300 inline-expr end",
        }).range(part.to - 1, part.to),
      ]

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

class ResultOutputWidget extends WidgetType {
  container: HTMLElement

  constructor(readonly scope: any, readonly index: number, readonly functionName?: string) {
    super()
    this.container = document.createElement("span")
    createRoot(this.container).render(
      <ResultView index={index} scope={scope} functionName={functionName} />
    )
  }

  eq(other: ResultOutputWidget) {
    return this.scope === other.scope && this.index === other.index
  }

  toDOM() {
    return this.container
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

  const toggleIsExpanded = () => {
    getGraphDocHandle().change(({ graph }) => {
      const node = getNode(graph, scope.id)
      node.expandedResultsByIndex[index] = !node.expandedResultsByIndex[index]
    })
  }

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
          "hover:bg-purple-200": isExpandable,
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
