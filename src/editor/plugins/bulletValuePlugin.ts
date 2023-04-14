import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { InlineExprNode, isLiteral } from "../../language/ast"
import { scopeFacet } from "./state"
import { valueOf } from "../../language/dumb-scopes"

export const bulletEvalPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = getBulletDecorations(view)
    }

    update(update: ViewUpdate) {
      //if (update.docChanged || update.viewportChanged || update.focusChanged || update.) {
      this.decorations = getBulletDecorations(update.view)
      //}
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
        /*Decoration.mark({
          class: "font-mono bg-gray-200 rounded border border-gray-200",
          inclusive: true,
        }).range(part.from, part.to), */
        Decoration.mark({
          class: "text-gray-400",
          inclusive: true,
        }).range(part.from, part.from + 1),
        Decoration.mark({
          inclusive: true,
          class: "text-gray-400",
        }).range(part.to - 1, part.to),
      ]

      if (!isLiteral(part)) {
        decorations.push(
          Decoration.widget({
            widget: new ResultOutputWidget(valueOf(scope.value[index])),
            side: 1,
          }).range(part.to)
        )
      }

      return decorations
    }

    return []
  })

  return Decoration.set(decorations)
}

class ResultOutputWidget extends WidgetType {
  constructor(readonly value: any) {
    super()
  }

  eq(other: ResultOutputWidget) {
    return false
  }

  toDOM() {
    const container = document.createElement("span")
    container.setAttribute("aria-hidden", "true")
    container.className = "italic text-purple-600 ml-2"
    container.style.color = "var(--accent-color-6)"
    container.innerText = `= ${valueToString(this.value)}`
    return container
  }

  ignoreEvent() {
    return true
  }
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
