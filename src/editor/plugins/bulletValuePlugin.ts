import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { parseProperty } from "../../language"
import { getGraph } from "../../graph"
import { ArgumentNode, isLiteral } from "../../language/ast"
import { getValueOfNode } from "../../language/scopes"
import { autorun, IReactionDisposer } from "mobx"
import { nodeIdFacet, parentIdsFacet } from "./facets"
import { compareArrays } from "../../utils"

export const bulletEvalPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = getBulletDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.focusChanged) {
        this.decorations = getBulletDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)

function getBulletDecorations(view: EditorView): DecorationSet {
  const docString = view.state.doc.sliceString(0)
  const property: ArgumentNode | undefined = parseProperty(docString)

  if (!property) {
    return Decoration.set([])
  }

  const nodeId = view.state.facet(nodeIdFacet)
  const parentIds = view.state.facet(parentIdsFacet)

  const decorations = (
    property.name
      ? [Decoration.mark({ class: "text-gray-500" }).range(0, docString.indexOf(":"))]
      : []
  ).concat(
    !isLiteral(property.exp)
      ? [
          Decoration.widget({
            widget: new ResultOutputWidget(nodeId, parentIds),
            side: 1,
          }).range(property.to, property.to),
        ]
      : []
  )

  return Decoration.set(decorations)
}

class ResultOutputWidget extends WidgetType {
  private disposer: IReactionDisposer | undefined = undefined

  constructor(readonly nodeId: string, readonly parentIds: string[]) {
    super()
  }

  eq(other: ResultOutputWidget) {
    return other.nodeId === this.nodeId && compareArrays(other.parentIds, this.parentIds)
  }

  toDOM() {
    const container = document.createElement("span")
    container.setAttribute("aria-hidden", "true")
    container.className = "italic ml-2 text-gray-600"
    container.innerText = "="

    this.disposer = autorun(async () => {
      const value = await getValueOfNode(this.parentIds, this.nodeId)

      if (value !== undefined) {
        container.className = "italic text-purple-600 ml-2"
        container.style.color = "var(--accent-color-6)"
        container.innerText = `= ${valueToString(value)}`
      }
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
