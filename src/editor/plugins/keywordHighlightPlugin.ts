import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view"

export const keywordHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = getHighlightDecorations(view)
    }

    update(update: ViewUpdate) {
      this.decorations = getHighlightDecorations(update.view)
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)

const KEYWORD_REGEX = /^(?<key>[\w\s]+:)/

function getHighlightDecorations(view: EditorView): DecorationSet {
  const source = view.state.doc.toString()

  const match = source.match(KEYWORD_REGEX)

  if (match) {
    const key = match.groups!.key

    return Decoration.set([
      Decoration.mark({
        class: "text-gray-500",
      }).range(0, key.length),
    ])
  }

  return Decoration.set([])
}
