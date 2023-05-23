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
import { getGraph, getLabelOfNode, getNode, GraphContext, GraphContextProps } from "../../graph"
import { graphContextFacet, scopeFacet } from "./state"
import { StateEffect, StateField } from "@codemirror/state"
import { createRoot } from "react-dom/client"
import { PopoverOutlineView } from "../../views/MapNodeView"

const OPEN_ON_HOVER_DELAY = 500

class RefIdWidget extends WidgetType {
  constructor(
    readonly view: EditorView,
    readonly id: string,
    readonly position: number,
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

    let timeout: any
    let isMouseOverTooltip = false
    let isMouseOverToken = false

    refIdElement.addEventListener("click", () => {
      // triggerSelect(this.id)
    })

    refIdElement.addEventListener("mouseenter", () => {
      isMouseOverToken = true

      timeout = setTimeout(() => {
        this.view.dispatch({
          effects: setCursorTooltipField.of([
            {
              pos: this.position,
              create: () => {
                const dom = document.createElement("div")

                dom.addEventListener("keydown", (evt) => {
                  console.log("key down!!!")
                  evt.stopPropagation()
                  evt.preventDefault()
                })
                dom.addEventListener("keyup", (evt) => {
                  console.log("key down!!!")
                  evt.stopPropagation()
                  evt.preventDefault()
                })

                dom.addEventListener("keypress", (evt) => {
                  console.log("key down!!!")
                  evt.stopPropagation()
                  evt.preventDefault()
                })

                const innerTooltip = document.createElement("div")
                innerTooltip.classList.add("inner-tooltip")
                dom.appendChild(innerTooltip)

                const container = document.createElement("div")
                innerTooltip.appendChild(container)

                const root = createRoot(container)

                dom.addEventListener("mouseenter", (evt) => {
                  isMouseOverTooltip = true
                  evt.stopPropagation()
                  evt.preventDefault()
                })

                dom.addEventListener("mouseleave", () => {
                  isMouseOverTooltip = false

                  // defer so mouseenter event so token can override the mouseleave event
                  setTimeout(() => {
                    if (isMouseOverToken) {
                      return false
                    }

                    this.view.dispatch({
                      effects: setCursorTooltipField.of([]),
                    })
                  })
                })

                const graphContext = this.view.state.facet(graphContextFacet)

                console.log("render")

                root.render(
                  <PopoverOutlineView
                    key={Math.random()}
                    graphContext={graphContext}
                    rootId={this.id}
                    onOpenNodeInNewPane={() => {}}
                  />
                )

                container.innerText = "foobar"
                return { dom }
              },
            },
          ]),
        })
      }, OPEN_ON_HOVER_DELAY)

      refIdElement.classList.add("bg-blue-200")
      this.setIsHoveringOverId(this.id)
    })

    refIdElement.addEventListener("mouseleave", () => {
      isMouseOverToken = false

      // defer mouseenter event so tooltip can override the mouseleave event
      setTimeout(() => {
        refIdElement.classList.remove("bg-blue-200")
        this.setIsHoveringOverId(this.id)

        if (isMouseOverTooltip) {
          return
        }

        isMouseOverTooltip = false

        if (timeout) {
          clearTimeout(timeout)
        }

        this.view.dispatch({
          effects: setCursorTooltipField.of([]),
        })
      })
    })

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

      add(
        from,
        to,
        Decoration.replace({
          widget: new RefIdWidget(view, id, from, setIsHoveringOverId),
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
