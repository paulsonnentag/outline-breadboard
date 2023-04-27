import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { getGraph, getLabelOfNode, getNode } from "../../graph"
import { triggerSelect } from "../../selectionHandler"
import { scopeFacet } from "./state"

class RefIdWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly isInInlineExpr: boolean,
    readonly setIsHoveringOverId: (nodeId: string | undefined) => void
  ) {
    super()
  }

  eq(other: RefIdWidget) {
    return false
  }

  toDOM() {
    const graph = getGraph()
    const node = getNode(graph, this.id)

    const refIdElement = document.createElement("span")
    refIdElement.setAttribute("aria-hidden", "true")
    refIdElement.className = `-ml-1 px-1 text-blue-500 font-medium rounded`
    refIdElement.innerText = `${getLabelOfNode(node)}`

    refIdElement.addEventListener("click", () => {
      triggerSelect(this.id)
    })

    refIdElement.addEventListener("mouseenter", () => {
      refIdElement.classList.add("bg-blue-200")
      this.setIsHoveringOverId(this.id)
    })

    refIdElement.addEventListener("mouseleave", () => {
      refIdElement.classList.remove("bg-blue-200")
      this.setIsHoveringOverId(this.id)
    })

    if (this.isInInlineExpr) {
      const inlineExprWrapper = document.createElement("span")
      inlineExprWrapper.className = "inline-expr middle"

      inlineExprWrapper.append(refIdElement)
      return inlineExprWrapper
    }

    return refIdElement
  }

  ignoreEvent() {
    return false
  }
}

export const REF_ID_REGEX = /#\[([^\]]+)]/g

export function getRefIdTokenPlugin(setIsHoveringOverId: (nodeId: string | undefined) => void) {
  const refIdMatcher = new MatchDecorator({
    regexp: REF_ID_REGEX,
    decorate: (add, from, to, [, id], view) => {
      const scope = view.state.facet(scopeFacet)

      const isInInlineExpr = scope.bullet.isRangeInInlineExpression(from, to)

      add(
        from,
        to,
        Decoration.replace({
          widget: new RefIdWidget(id, isInInlineExpr, setIsHoveringOverId),
        })
      )
    },
  })

  return ViewPlugin.fromClass(
    class {
      placeholders: DecorationSet

      constructor(view: EditorView) {
        this.placeholders = refIdMatcher.createDeco(view)
      }

      update(update: ViewUpdate) {
        this.placeholders = refIdMatcher.updateDeco(update, this.placeholders)
      }
    },
    {
      decorations: (instance) => instance.placeholders,
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => {
          return view.plugin(plugin)?.placeholders || Decoration.none
        }),
    }
  )
}
