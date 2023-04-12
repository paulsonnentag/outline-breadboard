import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { ArgumentNode, BulletNode, InlineExprNode, isLiteral } from "../../language/ast"
import { getValueOfNode } from "../../language/scopes"
import { autorun, IReactionDisposer } from "mobx"
import { nodeIdFacet, parentIdsFacet } from "./facets"
import { compareArrays } from "../../utils"
import { parseBullet } from "../../language"

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
  const bullet: BulletNode = parseBullet(docString)

  if (!bullet) {
    return Decoration.set([])
  }

  const nodeId = view.state.facet(nodeIdFacet)
  const parentIds = view.state.facet(parentIdsFacet)

  const decorations = bullet.value.flatMap((part, index) => {
    if (part instanceof InlineExprNode) {
      const decorations = [
        Decoration.mark({
          class: "font-mono bg-gray-200 rounded border border-gray-200",
          inclusive: true,
        }).range(part.from, part.to),
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
            widget: new ResultOutputWidget(parentIds, nodeId, index),
          }).range(part.to)
        )
      }

      return decorations
    }

    return []
  })

  /*
  const decorations = (
    bullet.key ? [Decoration.mark({ class: "text-gray-500" }).range(0, docString.indexOf(":"))] : []
  ).concat(
    !isLiteral(bullet.exp)
      ? [
          Decoration.widget({
            widget: new ResultOutputWidget(nodeId, parentIds),
            side: 1,
          }).range(bullet.to, bullet.to),
        ]
      : []
  )

*/

  return Decoration.set(decorations)
}

class ResultOutputWidget extends WidgetType {
  private disposer: IReactionDisposer | undefined = undefined

  constructor(readonly parentIds: string[], readonly nodeId: string, readonly index: number) {
    super()
  }

  eq(other: ResultOutputWidget) {
    return (
      other.nodeId === this.nodeId &&
      other.index === this.index &&
      compareArrays(other.parentIds, this.parentIds)
    )
  }

  toDOM() {
    const container = document.createElement("span")
    container.setAttribute("aria-hidden", "true")
    container.className = "italic ml-2 text-gray-600"
    container.innerText = "="

    this.disposer = autorun(async () => {
      let value
      let hasError = false

      try {
        value = (await getValueOfNode(this.parentIds, this.nodeId))[this.index]
      } catch (err: any) {
        hasError = true
        value = err.message
      }

      if (hasError || value === undefined) {
        container.innerText = "="
      } else {
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
