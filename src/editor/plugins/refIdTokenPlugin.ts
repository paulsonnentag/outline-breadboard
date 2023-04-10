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

class RefIdWidget extends WidgetType {
  constructor(
    readonly id: string,
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

    const wrap = document.createElement("span")
    wrap.setAttribute("aria-hidden", "true")
    wrap.className = "px-1 rounded border border-gray-300 bg-gray-100"
    wrap.innerText = getLabelOfNode(node)

    wrap.addEventListener("click", () => {
      triggerSelect(this.id)
    })

    wrap.addEventListener("mouseenter", () => {
      wrap.classList.remove("bg-gray-100")
      wrap.classList.add("bg-gray-200")
      this.setIsHoveringOverId(this.id)
    })

    wrap.addEventListener("mouseleave", () => {
      wrap.classList.add("bg-gray-100")
      wrap.classList.remove("bg-gray-200")
      this.setIsHoveringOverId(this.id)
    })

    return wrap
  }

  ignoreEvent() {
    return false
  }
}

export function getRefIdTokenPlugin(setIsHoveringOverId: (nodeId: string | undefined) => void) {
  const refIdMatcher = new MatchDecorator({
    regexp: /#\[([^\]]+)]/g,
    decoration: ([, id]) =>
      Decoration.replace({
        widget: new RefIdWidget(id, setIsHoveringOverId),
      }),
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
