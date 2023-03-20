import { ValueInputProps } from "./TextNodeValueView"
import { Ref, useEffect, useRef, useState } from "react"
import { EditorView } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { parseFormula } from "./formulas"
import { getGraph, Graph, Node, useGraph } from "./graph"
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
        !node.value.includes(name)
      ) {
        return []
      }

      return [{ label: node.value, apply: `@{${node.id}}` }]
    }),
  }
}
