import { ValueInputProps } from "./TextNodeValueView"
import { KeyboardEvent, useEffect, useRef, useState } from "react"
import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { parseFormula } from "./formulas"
import { getGraph, getLabelOfNode, getNode, Node, useGraph } from "./graph"
import { autocompletion, CompletionContext } from "@codemirror/autocomplete"
import { isString } from "./utils"

export function CodeInput({ innerRef, value, onChange, onBlur, isFocused }: ValueInputProps) {
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
        console.error(err)
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
  }, [value, editorRef.current, graph])

  useEffect(() => {
    const view = (editorRef.current = new EditorView({
      doc: value,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        refIdTokensPlugin,
        autocompletion({
          activateOnTyping: true,
          override: [mentionCompletionContext],
        }),
      ],
      parent: innerRef.current!,
      dispatch(transaction) {
        view.update([transaction])

        if (transaction.docChanged) {
          onChange(view.state.doc.toString())
        }
      },
    }))

    if (isFocused && !view.hasFocus) {
      view.focus()
    }

    return () => {
      view.destroy()
    }
  }, [currentEditor, isFocused])

  useEffect(() => {
    if (isFocused && editorRef.current && !editorRef.current.hasFocus) {
      editorRef.current.focus()
    }
  }, [isFocused])

  const _onKeyDown = (evt: KeyboardEvent) => {
    evt.stopPropagation()
  }

  return (
    <div className="flex gap-2 items-baseline">
      {isFocused && <div onKeyDown={_onKeyDown} onBlur={onBlur} ref={innerRef}></div>}
      <span className="text-blue-400 max-w-[200px]">
        {isFocused && "= "}
        {JSON.stringify(computedValue)}
      </span>
    </div>
  )
}

async function mentionCompletionContext(context: CompletionContext) {
  let reference = context.matchBefore(/@[^@]*/)

  if (reference === null) {
    return null
  }

  const name = reference.text.toString().slice(1).trim()
  const graph = getGraph()

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
    return false
  }

  toDOM() {
    const graph = getGraph()
    const node = getNode(graph, this.id)

    const wrap = document.createElement("span")
    wrap.setAttribute("aria-hidden", "true")
    wrap.className = "px-1 rounded border border-blue-700 bg-blue-500 text-white"
    wrap.innerText = getLabelOfNode(node)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

const refIdMatcher = new MatchDecorator({
  regexp: /@{([^@]+)}/g,
  decoration: ([, id]) =>
    Decoration.replace({
      widget: new RefIdWidget(id),
    }),
})

const refIdTokensPlugin = ViewPlugin.fromClass(
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
