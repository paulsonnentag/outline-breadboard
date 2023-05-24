import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  showTooltip,
  Tooltip,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { getGraph, getLabelOfNode, getNode } from "../../graph"
import { scopeFacet } from "./state"
import { StateEffect, StateField } from "@codemirror/state"
import { PopOverValue } from "../../Root"

class RefIdWidget extends WidgetType {
  constructor(
    readonly view: EditorView,
    readonly id: string,
    readonly position: number,
    readonly setIsHoveringOverId: (nodeId: string | undefined) => void,
    readonly onOpenPopOver: (x: number, y: number, value: PopOverValue) => void
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
    refIdElement.className = `-ml-1 px-1 text-blue-500 font-medium rounded hover:bg-blue-200 cursor-pointer`
    refIdElement.innerText = `${getLabelOfNode(node)}`

    refIdElement.dataset.refIdTokenId = this.id

    refIdElement.addEventListener("click", (evt) => {
      const rect = refIdElement.getBoundingClientRect()

      this.onOpenPopOver(rect.x, rect.y, { type: "node", id: this.id })

      evt.stopPropagation()
    })

    refIdElement.addEventListener("mouseenter", () => {
      this.setIsHoveringOverId(this.id)
    })

    refIdElement.addEventListener("mouseleave", () => {
      this.setIsHoveringOverId(undefined)
    })

    return refIdElement
  }

  ignoreEvent() {
    return false
  }
}

export const REF_ID_REGEX = /#\[([^\]]+)]/g

export function getRefIdTokenPlugin(
  setIsHoveringOverId: (nodeId: string | undefined) => void,
  onOpenPopOver: (x: number, y: number, value: PopOverValue) => void
) {
  const refIdMatcher = new MatchDecorator({
    regexp: REF_ID_REGEX,
    decorate: (add, from, to, [, id], view) => {
      const scope = view.state.facet(scopeFacet)

      add(
        from,
        to,
        Decoration.replace({
          widget: new RefIdWidget(view, id, from, setIsHoveringOverId, onOpenPopOver),
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

export const cursorTooltipField = StateField.define<readonly Tooltip[]>({
  create: () => [],

  update(tooltips, tr) {
    for (let e of tr.effects) {
      if (e.is(setCursorTooltipField)) {
        console.log("update")
        return e.value
      }
    }

    if (tr.docChanged) return []

    return tooltips
  },

  provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
})

const setCursorTooltipField = StateEffect.define<readonly Tooltip[]>()
