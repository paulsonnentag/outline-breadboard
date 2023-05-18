import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"

class ImageWidget extends WidgetType {
  constructor(readonly url: string) {
    super()
  }

  eq(other: ImageWidget) {
    return other.url === this.url
  }

  toDOM() {
    const container = document.createElement("span")
    const image = document.createElement("img")
    image.src = this.url
    image.style.height = "200px"
    image.style.width = "auto"

    return container
  }

  ignoreEvent() {
    return false
  }
}

export const IMAGE_REGEX = /!\[([^\]]+)]/g

const imageMatcher = new MatchDecorator({
  regexp: IMAGE_REGEX,
  decorate: (add, from, to, [, url], view) => {
    add(
      from,
      to,
      Decoration.replace({
        widget: new ImageWidget(url),
      })
    )
  },
})

export const imagePlugin = ViewPlugin.fromClass(
  class {
    placeholders: DecorationSet

    constructor(view: EditorView) {
      this.placeholders = imageMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.placeholders = imageMatcher.updateDeco(update, this.placeholders)
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