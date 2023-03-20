import { ValueInputProps } from "./TextNodeValueView"
import { useContext, useEffect, useRef, useState } from "react"
import { EditorView } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { parseFormula } from "./formulas"
import { useGraph } from "./graph"

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
      extensions: [minimalSetup, EditorView.lineWrapping],
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
      <div onKeyDownCapture={onKeyDown} onBlur={onBlur} ref={innerRef}></div>
      <span className="text-blue-400">={JSON.stringify(computedValue)}</span>
    </div>
  )
}
