import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { evalInlineExp, iterateOverArgumentNodes, parseInlineExp } from "../../language"
import { NamedArgumentWidget } from "./keywordHighlightPlugin"
import { getGraph } from "../../graph"

export const expressionEvalPlugin = ViewPlugin.fromClass(
  class {
    placeholders: DecorationSet

    constructor(view: EditorView) {
      this.placeholders = expressionMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.placeholders = expressionMatcher.updateDeco(update, this.placeholders)
    }
  },
  {
    decorations: (instance) => instance.placeholders,
  }
)

const expressionMatcher = new MatchDecorator({
  regexp: /\{[^}]+}/g,
  decorate: (add, from, to, [source], view) => {
    // decorate "{"
    add(from, from + 1, Decoration.mark({ class: "text-gray-300" }))

    const ast = parseInlineExp(source)

    if (ast) {
      iterateOverArgumentNodes(ast, (arg) => {
        if (arg.name === "") {
          return
        }

        const keyFrom = arg.from + from
        const keyTo = keyFrom + arg.name.length + 1
        const argTo = arg.to + from

        add(
          keyFrom,
          keyTo,
          Decoration.replace({
            widget: new NamedArgumentWidget(keyFrom, argTo, arg.name, view),
          })
        )
      })
    }

    // decorate "}"
    add(to - 1, to, Decoration.mark({ class: "text-gray-300" }))

    // add result of computation
    add(
      to,
      to,
      Decoration.widget({
        widget: new ExpressionWidget(source),
        side: 1,
      })
    )
  },
})

class ExpressionWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: ExpressionWidget) {
    return false
  }

  toDOM() {
    const graph = getGraph()

    const container = document.createElement("span")
    container.setAttribute("aria-hidden", "true")
    container.innerText = `=`

    evalInlineExp(graph, this.source)
      .then((result: any) => {
        container.className = "italic text-purple-600 ml-2"
        container.style.color = "var(--accent-color-6)"
        container.innerText = `= ${valueToString(result)}`
      })
      .catch((message: string) => {
        container.className = "italic text-red-600 ml-2"
        container.innerText = `= ${message}`
      })

    return container
  }

  ignoreEvent() {
    return false
  }
}

function valueToString(x: any): string {
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
