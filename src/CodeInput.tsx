import { ValueInputProps } from "./TextNodeValueView"
import { useEffect, useRef, useState } from "react"
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { parseFormula } from "./formulas"
import { getGraph, getLabelOfNode, getNode, Node, useGraph } from "./graph"
import { autocompletion, CompletionContext } from "@codemirror/autocomplete"
import { isString } from "./utils"

export function CodeInput({
  innerRef,
  value,
  onChange,
  onKeyDown,
  onBlur,
  isFocused,
}: ValueInputProps) {
  const { graph } = useGraph()
  const currentEditor = innerRef.current
  const editorRef = useRef<EditorView>()
  const [computedValue, setComputedValue] = useState<any>(null)

  useEffect(() => {
    const formula = parseFormula(value)

    if (formula) {
      try {
        formula.eval(graph).then((result: any) => {
          setComputedValue(result)
        })
      } catch (err) {
        setComputedValue("invalid")
      }
    }

    if (editorRef.current && editorRef.current.state) {
      const docValue = editorRef.current.state.doc.toString()

      if (docValue !== value) {
        editorRef.current?.dispatch(
          editorRef.current.state.update({
            changes: {
              from: 0,
              to: docValue.length,
              insert: value,
            },
          })
        )
      }
    }
  }, [value, editorRef.current])

  console.log(editorRef.current)

  useEffect(() => {
    const view = (editorRef.current = new EditorView({
      doc: value,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        autocompletion({
          activateOnTyping: true,
          override: [mentionCompletionContext],
        }),
        refIdTokenPlugin,
      ],
      parent: innerRef.current!,
      dispatch(transaction) {
        view.update([transaction])

        if (transaction.docChanged) {
          onChange(view.state.doc.toString())
        }
      },
    }))

    return () => {
      view.destroy()
    }
  }, [currentEditor])

  useEffect(() => {
    if (isFocused && document.activeElement !== currentEditor && currentEditor) {
      console.log("focus")
      currentEditor.focus()
    }
  }, [isFocused])

  return (
    <div>
      <div onBlur={onBlur} ref={innerRef} onKeyDown={(evt) => evt.stopPropagation()}></div>
      <span className="text-blue-400">={JSON.stringify(computedValue)}</span>
    </div>
  )
}

async function mentionCompletionContext(context: CompletionContext) {
  let reference = context.matchBefore(/@[^@]*/)

  if (reference === null) {
    return null
  }

  const name = reference.text.toString().slice(1).trim()
  const graph = await getGraph()

  return {
    from: reference.from,
    filter: false,
    options: Object.values(graph).flatMap((node: Node) => {
      if (
        node.type !== "value" ||
        !isString(node.value) ||
        node.value === "" ||
        node.value.startsWith("=") ||
        !node.value.includes(name)
      ) {
        return []
      }

      return [{ label: node.value, apply: `@{${node.id}}` }]
    }),
  }
}

class RefIdWidget extends WidgetType {
  constructor(readonly id: string) {
    super()
  }

  eq(other: RefIdWidget) {
    return other.id == this.id
  }

  toDOM() {
    const graph = getGraph()
    const node = getNode(graph, this.id)

    const wrap = document.createElement("span")
    wrap.setAttribute("aria-hidden", "true")
    wrap.className = "px-2 py-1 rounded border border-gray-200"
    wrap.innerText = getLabelOfNode(node)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

const refIdTokenPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = refIdTokens(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = refIdTokens(update.view)
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

function refIdTokens(view: EditorView) {
  const widgets = []

  const docString = view.state.doc.toString()

  for (let { from, to } of view.visibleRanges) {
    const string = docString.slice(from, to)

    console.log("trye", string)

    const regex = new RegExp("@{([^@]+)}", "g")

    let match
    while ((match = regex.exec(string)) != null) {
      console.log("match", match)
      const value = match[0]
      const from = match.index
      const to = from + value.length
      const id = match[1]

      let deco = Decoration.replace({
        widget: new RefIdWidget(id),
        side: 1,
      })
      widgets.push(deco.range(from, to))
    }
  }
  return Decoration.set(widgets)
}
