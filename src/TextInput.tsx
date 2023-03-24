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
import { getGraph, getLabelOfNode, getNode, Node } from "./graph"
import { autocompletion, CompletionContext } from "@codemirror/autocomplete"
import { isString } from "./utils"
import { isBackspace, isDown, isEnter, isTab, isUp } from "./keyboardEvents"

interface TextInputProps {
  value: string
  isFocused: boolean
  focusOffset: number
  onChange: (value: string) => void
  onFocusUp: () => void
  onFocusDown: () => void
  onSplit: (position: number) => void
  onJoinWithPrev: () => void
  onFocus: () => void
  onBlur: () => void
  onIndent: () => void
  onOutdent: () => void
}

export function TextInput({
  value,
  isFocused,
  focusOffset,
  onChange,
  onOutdent,
  onIndent,
  onSplit,
  onJoinWithPrev,
  onFocusUp,
  onFocusDown,
  onFocus,
}: TextInputProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView>()
  const [computedValue, setComputedValue] = useState<any>(null)

  // mount editor

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const view = (editorViewRef.current = new EditorView({
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
      parent: containerRef.current,
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
  }, [])

  // set focus

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (isFocused && currentEditorView && !currentEditorView.hasFocus) {
      currentEditorView.focus()

      setTimeout(() => {
        currentEditorView.dispatch({
          selection: {
            anchor: focusOffset,
            head: focusOffset,
          },
        })
      })
    }
  }, [isFocused])

  // update value

  useEffect(() => {
    const currentEditorView = editorViewRef.current

    if (!currentEditorView) {
      return
    }

    if (editorViewRef.current && editorViewRef.current.state) {
      const docValue = editorViewRef.current.state.doc.toString()

      if (docValue !== value) {
        editorViewRef.current?.dispatch(
          editorViewRef.current.state.update({
            changes: {
              from: 0,
              to: docValue.length,
              insert: value,
            },
          })
        )
      }
    }
  }, [value, editorViewRef.current])

  const onKeyDown = (evt: KeyboardEvent) => {
    const currentEditorView = editorViewRef.current
    if (!currentEditorView) {
      return
    }

    if (isEnter(evt)) {
      evt.preventDefault()
      const ranges = currentEditorView.state.selection.ranges

      // don't perform split if current selection is a range
      if (ranges.length !== 1 || ranges[0].from !== ranges[0].to) {
        return
      }
      onSplit(ranges[0].from)
    } else if (isTab(evt)) {
      evt.preventDefault()

      if (evt.shiftKey) {
        onOutdent()
      } else {
        onIndent()
      }
    } else if (isUp(evt)) {
      evt.preventDefault()
      onFocusUp()
    } else if (isDown(evt)) {
      evt.preventDefault()
      onFocusDown()
    } else if (isBackspace(evt)) {
      const ranges = currentEditorView.state.selection.ranges

      // join with previous if cursor is at beginning of text
      if (ranges.length === 1 && ranges[0].from === 0 && ranges[0].to === 0) {
        evt.preventDefault()
        onJoinWithPrev()
      }
    }
  }

  return <div ref={containerRef} onKeyDownCapture={onKeyDown} onFocus={onFocus}></div>
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
