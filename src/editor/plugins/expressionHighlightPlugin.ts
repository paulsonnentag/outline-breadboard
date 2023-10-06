import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { FnNode, InlineExprNode } from "../../language/ast"
import { FUNCTIONS } from "../../language/functions"
import { parseBullet } from "../../language"

export const expressionHighlightPlugin = ViewPlugin.fromClass(
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

function getHighlightDecorations(view: EditorView): DecorationSet {
  const source = view.state.doc.toString()

  // reparse instead of using scope, because scope can lag behind
  const decorations = parseBullet(source).value.flatMap((part, index) => {
    if (part instanceof InlineExprNode) {
      const decorations = [
        Decoration.mark({
          class: "text-gray-300",
        }).range(part.from, part.to),
      ]
        .concat(
          matchNumbers(source.slice(part.from, part.to)).map(({ from, to }) =>
            Decoration.mark({
              class: "cm-number-highlight",
            }).range(part.from + from, part.from + to)
          )
        )
        .concat(
          matchNames(source.slice(part.from, part.to)).map(({ from, to }) =>
            Decoration.mark({
              class: "font-medium cm-name-highlight",
            }).range(part.from + from, part.from + to)
          )
        )

      return decorations
    }

    return []
  })

  return Decoration.set(decorations.sort((a, b) => a.from - b.from))
}

function matchNumbers(inputStr: string) {
  const regex = /\b\d+(\.\d+)?\b/g
  let match
  const ranges = []

  while ((match = regex.exec(inputStr)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length, value: match[0] })
  }

  return ranges
}
function matchNames(inputStr: string) {
  const regex = /[a-zA-Z][a-zA-Z]*:?/g
  let match
  const ranges = []

  while ((match = regex.exec(inputStr)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length, value: match[0] })
  }

  return ranges
}

/*

.concat(
                (part.expr as FnNode).args.map((a) =>
                  Decoration.mark({
                    class: "text-gray-400",
                  }).range(part.from + a.from, part.from + a.to)
                )
              )

 */
