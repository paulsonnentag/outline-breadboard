import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import {
  registerSelectionHandler,
  SelectionHandler,
  unregisterSelectionHandler,
} from "../../selectionHandler"

export const KEYWORD_REGEX = /^[a-zA-Z0-9_-]+:/g

const keywordMatcher = new MatchDecorator({
  regexp: KEYWORD_REGEX,
  decoration: () => Decoration.mark({ class: "text-gray-500" }),
})

export const keywordHighlightPlugin = ViewPlugin.fromClass(
  class {
    placeholders: DecorationSet

    constructor(view: EditorView) {
      this.placeholders = keywordMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.placeholders = keywordMatcher.updateDeco(update, this.placeholders)
    }
  },
  {
    decorations: (instance) => instance.placeholders,
    provide: (plugin) =>
      EditorView.decorations.of((view) => {
        return view.plugin(plugin)?.placeholders || Decoration.none
      }),
  }
)

export class NamedArgumentWidget extends WidgetType {
  container: HTMLElement | undefined
  selectionHandler: SelectionHandler | undefined

  constructor(
    readonly from: number,
    readonly to: number,
    readonly name: string,
    private view: EditorView
  ) {
    super()

    this.onClick = this.onClick.bind(this)
    this.onClickOutside = this.onClickOutside.bind(this)
    this.onSelectNodeId = this.onSelectNodeId.bind(this)
  }

  eq(other: NamedArgumentWidget) {
    return false
  }

  toDOM() {
    const container = (this.container = document.createElement("span"))
    container.setAttribute("aria-hidden", "true")
    container.className =
      "italic text-gray-500 mr-2 border border-dashed border-white cursor-pointer"
    container.innerText = `${this.name}:`

    container.addEventListener("click", this.onClick)
    document.body.addEventListener("click", this.onClickOutside, true)

    return container
  }

  onClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.container!.classList.add("border-gray-500")
    this.container!.classList.remove("border-white")

    this.selectionHandler = {
      onSelect: (nodeId) => {
        this.view.dispatch(
          this.view.state.update({
            changes: {
              from: this.from,
              to: this.to,
              insert: `${this.name}:#[${nodeId}]`,
            },
          })
        )
      },
      onUnregister: () => {
        this.container!.classList.remove("border-gray-500")
        this.container!.classList.add("border-white")
      },
    }

    registerSelectionHandler(this.selectionHandler)
  }

  onClickOutside(event: MouseEvent) {
    if (event.target === this.container) {
      return
    }

    // this is hacky, but if we unregister the selection handler on the next frame
    // it can be still called if the outside click event triggers a selection
    setTimeout(() => {
      this.container!.classList.remove("border-gray-500")
      this.container!.classList.add("border-white")

      if (this.selectionHandler) {
        unregisterSelectionHandler(this.selectionHandler)
      }

      this.selectionHandler = undefined
    })
  }

  onSelectNodeId(nodeId: string) {}

  ignoreEvent() {
    return false
  }

  destroy(dom: HTMLElement) {
    document.removeEventListener("click", this.onClickOutside)
    super.destroy(dom)
  }
}
