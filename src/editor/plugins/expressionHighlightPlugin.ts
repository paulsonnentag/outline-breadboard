import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { FnNode, InlineExprNode, isLiteral } from "../../language/ast"
import { scopeFacet } from "./state"
import { ComputationSummaryView, FUNCTIONS } from "../../language/functions"
import { HAS_MISSING_ARGUMENTS_VALUE } from "../../language/functions/function-def"
import { getGraphDocHandle, getNode } from "../../graph"
import { createRoot } from "react-dom/client"
import { Scope } from "../../language/scopes"
import classNames from "classnames"
import colors from "../../colors"
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

  console.log()

  // reparse instead of using scope, because scope can lag behind
  const decorations = parseBullet(source).value.flatMap((part, index) => {
    if (part instanceof InlineExprNode) {
      const decorations = [
        Decoration.mark({
          class: "text-gray-300",
        }).range(part.from, part.from + 1),
      ]
        .concat(
          // only highlight functions that have autocomplete to avoid highlighting things like "1 + 1" which also use functions under the hood
          part.expr instanceof FnNode &&
            FUNCTIONS[part.expr.name] &&
            FUNCTIONS[part.expr.name].autocomplete
            ? [
                Decoration.mark({
                  class: "font-medium text-gray-400",
                }).range(part.from + 1, part.from + 1 + part.expr.name.length),
              ]
            : []
        )
        .concat(
          Decoration.mark({
            class: "text-gray-300",
          }).range(part.to - 1, part.to)
        )

      return decorations
    }

    return []
  })

  return Decoration.set(decorations)
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
