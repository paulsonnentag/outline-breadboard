import { KeyboardEvent, useEffect, useRef } from "react"
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
import { getGraph, getLabelOfNode, getNode, Graph, Node, useGraph } from "../graph"
import {
  autocompletion,
  Completion,
  CompletionContext,
  completionStatus,
} from "@codemirror/autocomplete"
import { isString } from "../utils"
import { isBackspace, isDown, isEnter, isTab, isUp } from "../keyboardEvents"
import {
  evalInlineExp,
  FunctionDef,
  FUNCTIONS,
  iterateOverArgumentNodes,
  parseInlineExp,
} from "../formulas"
import { createPlaceNode } from "../views/MapNodeView"
import { placesAutocompleteApi } from "../google"
import {
  registerSelectionHandler,
  SelectionHandler,
  unregisterSelectionHandler,
} from "../selectionHandler"

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
  onBlur,
}: TextInputProps) {
  const { changeGraph } = useGraph()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView>()

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
        keywordHighlightPlugin,
        expressionEvalPlugin,
        autocompletion({
          activateOnTyping: true,
          override: [getMentionCompletionContext(changeGraph), functionAutocompletionContext],
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
      // ignore enter if auto complete is active
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

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
      // ignore up key if auto complete is active
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

      evt.preventDefault()
      onFocusUp()
    } else if (isDown(evt)) {
      // ignore down key if auto complete is active
      if (completionStatus(currentEditorView.state) !== null) {
        return
      }

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

  const _onBlur = () => {
    const currentEditorView = editorViewRef.current
    if (currentEditorView) {
      currentEditorView.dispatch({
        selection: {
          anchor: 0,
          head: 0,
        },
      })
    }

    onBlur()
  }

  return (
    <div
      ref={containerRef}
      onKeyDownCapture={onKeyDown}
      onFocus={onFocus}
      onBlur={_onBlur}
      onDragOverCapture={(evt) => evt.stopPropagation()}
      onDragEnterCapture={(evt) => evt.stopPropagation()}
    ></div>
  )
}

function functionAutocompletionContext(context: CompletionContext) {
  let reference = context.matchBefore(/\/.*/)

  if (reference === null) {
    return null
  }

  const search = reference.text.toString().slice(1).trim()

  const options = Object.values(FUNCTIONS).flatMap((fn: FunctionDef) => {
    if (!fn.autocomplete || !fn.autocomplete.label.includes(search)) {
      return []
    }

    const { label, value } = fn.autocomplete

    return [
      {
        label,
        apply: (view, completion, from, to) => {
          const indexOfDollarSign = value.indexOf("$")
          const cursorOffset = indexOfDollarSign !== -1 ? indexOfDollarSign : value.length

          view.dispatch(
            view.state.update({
              changes: {
                from: from,
                to: to,
                insert:
                  indexOfDollarSign !== -1
                    ? value.slice(0, indexOfDollarSign) + value.slice(indexOfDollarSign + 1)
                    : value,
              },
              selection: {
                anchor: from + cursorOffset,
                head: from + cursorOffset,
              },
            })
          )
        },
      } as Completion,
    ]
  })

  return {
    from: reference.from,
    filter: false,
    options,
  }
}

function getMentionCompletionContext(changeGraph: (fn: (graph: Graph) => void) => void) {
  return async function mentionCompletionContext(context: CompletionContext) {
    let reference = context.matchBefore(/@[^@]*/)

    if (reference === null) {
      return null
    }

    const graph = getGraph()
    const search = reference.text.toString().slice(1).trim()

    const placesOptions = await getPlacesAutocompletion(search, graph, changeGraph)

    const nodeOptions: Completion[] = Object.values(graph).flatMap((node: Node) => {
      if (
        node.type !== "value" ||
        !isString(node.value) ||
        node.value === "" ||
        node.value.startsWith("=") ||
        !node.value.includes(search)
      ) {
        return []
      }

      return [{ label: node.value, apply: `#[${node.id}]` }]
    })

    return {
      from: reference.from,
      filter: false,
      options: nodeOptions.concat(placesOptions),
    }
  }
}

async function getPlacesAutocompletion(
  search: string,
  graph: Graph,
  changeGraph: (fn: (graph: Graph) => void) => void
): Promise<Completion[]> {
  if (search === "") {
    return []
  }

  const result: google.maps.places.AutocompleteResponse = await placesAutocompleteApi.then(
    (autocomplete) => autocomplete.getPlacePredictions({ input: search })
  )

  return result.predictions.flatMap((prediction) => {
    if (graph[prediction.place_id]) {
      return []
    }

    return [
      {
        label: prediction.description,
        apply: async (view, completion, from, to) => {
          if (!graph[prediction.place_id]) {
            await createPlaceNode(changeGraph, prediction.place_id)
          }

          view.dispatch(
            view.state.update({
              changes: {
                from: from,
                to: to,
                insert: `#[${prediction.place_id}]`,
              },
            })
          )
        },
      } as Completion,
    ]
  })
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
  regexp: /#\[([^\]]+)]/g,
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

const keywordMatcher = new MatchDecorator({
  regexp: /^[a-zA-Z0-9_-]+:/g,
  decoration: () => Decoration.mark({ class: "text-gray-500" }),
})

const keywordHighlightPlugin = ViewPlugin.fromClass(
  class {
    placeholders: DecorationSet

    constructor(view: EditorView) {
      this.placeholders = keywordMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.placeholders = keywordMatcher.updateDeco(update, this.placeholders)
    }
  },
  {
    decorations: (instance) => instance.placeholders,
    provide: (plugin) =>
      EditorView.decorations.of((view) => {
        return view.plugin(plugin)?.placeholders || Decoration.none
      }),
  }
)

class ExpressionWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: ExpressionWidget) {
    return false
  }

  toDOM() {
    const graph = getGraph()

    const container = document.createElement("span")
    container.setAttribute("aria-hidden", "true")
    container.innerText = `=`

    evalInlineExp(graph, this.source)
      .then((result: any) => {
        container.className = "italic text-purple-600 ml-2"
        container.style.color = "var(--accent-color)"
        container.innerText = `= ${valueToString(result)}`
      })
      .catch((message: string) => {
        container.className = "italic text-red-600 ml-2"
        container.innerText = `= ${message}`
      })

    return container
  }

  ignoreEvent() {
    return false
  }
}

function valueToString(x: any): string {
  if (typeof x === "object" && x !== null) {
    const keyValuePairs: string[] = []

    for (const [key, value] of Object.entries(x)) {
      if (value === undefined) {
        continue
      }

      const stringValue = typeof value === "object" ? "{...}" : JSON.stringify(value)

      keyValuePairs.push(`${key}: ${stringValue}`)
    }

    return keyValuePairs.join(" ")
  }

  return JSON.stringify(x)
}

class NamedArgumentWidget extends WidgetType {
  container: HTMLElement | undefined
  selectionHandler: SelectionHandler | undefined

  constructor(
    readonly from: number,
    readonly to: number,
    readonly name: string,
    private view: EditorView
  ) {
    super()

    this.onClick = this.onClick.bind(this)
    this.onClickOutside = this.onClickOutside.bind(this)
    this.onSelectNodeId = this.onSelectNodeId.bind(this)
  }

  eq(other: NamedArgumentWidget) {
    return false
  }

  toDOM() {
    const container = (this.container = document.createElement("span"))
    container.setAttribute("aria-hidden", "true")
    container.className =
      "italic text-gray-500 mr-2 border border-dashed border-white cursor-pointer"
    container.innerText = `${this.name}:`

    container.addEventListener("click", this.onClick)
    document.body.addEventListener("click", this.onClickOutside, true)

    return container
  }

  onClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.container!.classList.add("border-gray-500")
    this.container!.classList.remove("border-white")

    this.selectionHandler = {
      onSelect: (nodeId) => {
        this.view.dispatch(
          this.view.state.update({
            changes: {
              from: this.from,
              to: this.to,
              insert: `${this.name}:#[${nodeId}]`,
            },
          })
        )
      },
      onUnregister: () => {
        this.container!.classList.remove("border-gray-500")
        this.container!.classList.add("border-white")
      },
    }

    registerSelectionHandler(this.selectionHandler)
  }

  onClickOutside(event: MouseEvent) {
    if (event.target === this.container) {
      return
    }

    // this is hacky, but if we unregister the selection handler on the next frame
    // it can be still called if the outside click event triggers a selection
    setTimeout(() => {
      this.container!.classList.remove("border-gray-500")
      this.container!.classList.add("border-white")

      if (this.selectionHandler) {
        unregisterSelectionHandler(this.selectionHandler)
      }

      this.selectionHandler = undefined
    })
  }

  onSelectNodeId(nodeId: string) {}

  ignoreEvent() {
    return false
  }

  destroy(dom: HTMLElement) {
    document.removeEventListener("click", this.onClickOutside)
    super.destroy(dom)
  }
}

const expressionMatcher = new MatchDecorator({
  regexp: /\{[^}]+}/g,
  decorate: (add, from, to, [source], view) => {
    // decorate "{"
    add(from, from + 1, Decoration.mark({ class: "text-gray-300" }))

    const ast = parseInlineExp(source)

    if (ast) {
      iterateOverArgumentNodes(ast, (arg) => {
        if (arg.name === "") {
          return
        }

        const keyFrom = arg.from + from
        const keyTo = keyFrom + arg.name.length + 1
        const argTo = arg.to + from

        add(
          keyFrom,
          keyTo,
          Decoration.replace({
            widget: new NamedArgumentWidget(keyFrom, argTo, arg.name, view),
          })
        )
      })
    }

    // decorate "}"
    add(to - 1, to, Decoration.mark({ class: "text-gray-300" }))

    // add result of computation
    add(
      to,
      to,
      Decoration.widget({
        widget: new ExpressionWidget(source),
        side: 1,
      })
    )
  },
})

const expressionEvalPlugin = ViewPlugin.fromClass(
  class {
    placeholders: DecorationSet

    constructor(view: EditorView) {
      this.placeholders = expressionMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.placeholders = expressionMatcher.updateDeco(update, this.placeholders)
    }
  },
  {
    decorations: (instance) => instance.placeholders,
  }
)
