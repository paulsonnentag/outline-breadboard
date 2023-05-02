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
  const scope = view.state.facet(scopeFacet)

  if (!scope) {
    return Decoration.set([])
  }

  const decorations = scope.bullet.value.flatMap((part, index) => {
    if (part instanceof InlineExprNode) {
      const decorations = [
        Decoration.mark({
          class: "text-gray-300",
        }).range(part.from, part.from + 1),
      ]
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
