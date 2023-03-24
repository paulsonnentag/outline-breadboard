import { KeyboardEvent, RefObject, useCallback, useEffect, useMemo, useState } from "react"
import ContentEditable from "react-contenteditable"
import { NodeValueViewProps } from "./OutlineEditor"
import { isArrowDown, isArrowUp, isBackspace, isEnter, isEscape } from "./keyboardEvents"
import { getCaretCharacterOffset, isString, mod, setCaretCharacterOffset } from "./utils"
import { useStaticCallback } from "./hooks"
import { createValueNode, getNode, Graph, useGraph, Node, createRefNode, NodeValue } from "./graph"
import { createPlaceNode, InputProperty, LatLongProperty, useGoogleApi } from "./views/MapNodeView"
import classNames from "classnames"
import { TextInput } from "./TextInput"

interface TextNodeValueView extends NodeValueViewProps {
  value: string
}

// Future: A schema for commands. Until we know its shape in more cases, hardcoding.
interface Command {
  title: string
  action: (graph: Graph, nodeId: string) => void // this get's passed in a mutable graph
  tabAction?: () => void
}

const COMPUTATION_COMMANDS: Command[] = [
  {
    title: "Use map view",
    action: (graph, nodeId) => {
      const node = getNode(graph, nodeId)

      // This logic should be elsewhere; starting here until we can see a clear protocol
      // It should also be made generic; action could simply state expected inputs

      const indexOfInput = InputProperty.getChildIndexesOfNode(graph, nodeId)[0]

      if (indexOfInput === undefined) {
        const input = createValueNode(graph, { value: "input:" })

        input.children.push(
          createValueNode(graph, {
            value: "position: 37.2296, -80.4139",
          }).id
        )

        node.children.push(input.id)
      }

      node.view = "map"
    },
  },
  {
    title: "Use table view",
    action: (graph, nodeId) => {
      const node = getNode(graph, nodeId)
      node.view = "table"
    },
  },
  {
    title: "Insert weather averages",
    action: (graph, nodeId) => {
      const node = getNode(graph, nodeId)

      node.computations = (node.computations ?? []).concat(["weather-averages"])
      const indexOfInput = InputProperty.getChildIndexesOfNode(graph, nodeId)[0]

      if (indexOfInput === undefined) {
        const input = createValueNode(graph, { value: "input:" })

        // Look for default pos
        const indexOfPos = LatLongProperty.getChildIndexesOfNode(graph, nodeId)[0]

        if (indexOfPos === undefined) {
          input.children.push(
            createValueNode(graph, {
              value: "position: 37.2296, -80.4139",
            }).id
          )
        } else {
          const posId = node.children[indexOfPos]
          const value = getNode(graph, posId).value ?? "position: 37.2296, -80.4139"
          input.children.push(
            createValueNode(graph, {
              value,
            }).id
          )
        }

        node.children.push(input.id)
      }
    },
  },
]

export function TextNodeValueView({
  id,
  value,
  innerRef,
  onChange,
  isFocused,
  onBlur,
  onReplaceNode,
}: TextNodeValueView) {
  const { graph, changeGraph } = useGraph()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedItemIndex, setSelectedItemIndex] = useState(0)
  const [poiSuggestions, setPoiSuggestions] = useState<Command[]>([])
  const google = useGoogleApi()
  const placesAutocomplete = useMemo(
    () => (google ? new google.maps.places.AutocompleteService() : undefined),
    [google]
  )
  const commandSearch = getCommandSearch(value)
  const node = getNode(graph, id)

  let commands: Command[] = []

  if (isMenuOpen && commandSearch) {
    switch (commandSearch.type) {
      case "computation":
        commands = commands.concat(
          COMPUTATION_COMMANDS.filter((command) =>
            command.title.includes(commandSearch.search.trim())
          )
        )
        break
      case "mention":
        commands = commands.concat(
          Object.values(graph).flatMap((node: Node) => {
            if (
              node.type !== "value" ||
              !isString(node.value) ||
              node.value === "" ||
              node.id === id ||
              !node.value.includes(commandSearch.search)
            ) {
              return []
            }

            return [
              {
                title: node.value,
                action: (graph: Graph) => {
                  const refNode = createRefNode(graph, node.id)
                  onReplaceNode(refNode.id)
                },
              },
            ]
          })
        )

        if (commandSearch.search !== "") {
          commands = commands.concat(poiSuggestions)
        }
        break
    }
  }

  useEffect(() => {
    if (
      !isMenuOpen ||
      !placesAutocomplete ||
      !commandSearch ||
      commandSearch.type !== "mention" ||
      commandSearch.search === ""
    ) {
      return
    }

    placesAutocomplete
      .getPlacePredictions({
        input: commandSearch.search,
      })
      .then((result: google.maps.places.AutocompleteResponse) => {
        console.log("fetch", result)

        setPoiSuggestions(
          result.predictions.flatMap((prediction) => {
            if (graph[prediction.place_id]) {
              return []
            }

            return [
              {
                title: prediction.description,
                action: async () => {
                  if (!graph[prediction.place_id]) {
                    await createPlaceNode(changeGraph, prediction.place_id)
                  }

                  changeGraph((graph) => {
                    const refNode = createRefNode(graph, prediction.place_id)
                    onReplaceNode(refNode.id)
                  })
                },
              },
            ]
          })
        )
      })
  }, [isMenuOpen, placesAutocomplete, commandSearch?.search, commandSearch?.type])

  const selectedCommand = commands[Math.min(selectedItemIndex, commands.length - 1)]

  const _onChange = useCallback(
    (newValue: string) => {
      if (
        (!includesCommandChar(newValue) ||
          (innerRef.current && getCaretCharacterOffset(innerRef.current) !== newValue.length)) &&
        isMenuOpen
      ) {
        setIsMenuOpen(false)
      }

      onChange(newValue)
    },
    [onChange, isMenuOpen]
  )

  const _onBlur = useCallback(() => {
    setIsMenuOpen(false)
  }, [onBlur])

  const onKeyDown = useStaticCallback((evt: KeyboardEvent) => {
    if (isCommandChar(evt.key)) {
      setIsMenuOpen(true)
      setSelectedItemIndex(0)
      return
    }

    if (isColon(evt.key)) {
      const contentRef = innerRef.current

      if (node.key === undefined && contentRef) {
        const offset = getCaretCharacterOffset(contentRef)

        const key = value.slice(0, offset).trim()
        const newValue = value.slice(offset)

        if (key === "") {
          return
        }

        changeGraph((graph) => {
          const node = getNode(graph, id)

          node.key = key
          node.value = newValue

          setCaretCharacterOffset(contentRef, 0)
        })
      }
    }

    if (isBackspace(evt)) {
      if (endsWithCommandChar(value)) {
        setIsMenuOpen(false)
      }
      return
    }

    if (isEscape(evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      setIsMenuOpen(false)
      return
    }

    if (isEnter(evt)) {
      if (selectedCommand) {
        evt.preventDefault()
        evt.stopPropagation()
        changeGraph((graph) => {
          let node = getNode<string>(graph, id)
          node.value = node.value.slice(0, -(commandSearch!.search.length + 1))
          selectedCommand.action(graph, id)
        })

        setIsMenuOpen(false)
      }

      return
    }

    if (isMenuOpen) {
      if (isArrowUp(evt)) {
        evt.stopPropagation()
        evt.preventDefault()
        setSelectedItemIndex((index) => mod(index - 1, commands.length))
        return
      }
      if (isArrowDown(evt)) {
        evt.stopPropagation()
        evt.preventDefault()
        setSelectedItemIndex((index) => mod(index + 1, commands.length))
        return
      }
    }
  })

  return (
    <div className="relative w-full flex">
      {node.key && <span className="text-gray-500 bold pr-1">{node.key}:</span>}

      <ValueInput
        innerRef={innerRef}
        value={value}
        onChange={_onChange}
        onKeyDown={onKeyDown}
        onBlur={_onBlur}
        isFocused={isFocused}
      />

      {isMenuOpen && (
        <div
          className="absolute z-30 rounded p-1 bg-slate-100 shadow-md w-56 text-sm"
          style={{ top: "100%" }}
        >
          {commands.map((command, index) => (
            <div
              key={index}
              className={classNames("py-1 px-2 rounded-sm", {
                "bg-slate-300": command === selectedCommand,
              })}
            >
              {command.title}
            </div>
          ))}

          {commands.length == 0 && "No results"}
        </div>
      )}
    </div>
  )
}

const COMMAND_REGEX = /([/@])([^/]*)$/

function isCommandChar(char: string): boolean {
  return char === "/" || char === "@"
}

function isColon(char: string): boolean {
  return char === ":"
}

function includesCommandChar(value: string): boolean {
  return COMMAND_REGEX.test(value)
}

function endsWithCommandChar(value: string): boolean {
  const command = getCommandSearch(value)
  return command ? command.search === "" : false
}

interface CommandSearch {
  type: "mention" | "computation"
  search: string
}

function getCommandSearch(value: string): CommandSearch | undefined {
  const match = value.match(COMMAND_REGEX)

  if (match) {
    const [, char, search] = match

    return {
      type: char === "@" ? "mention" : "computation",
      search,
    }
  }

  return undefined
}

export interface ValueInputProps {
  innerRef: RefObject<HTMLElement>
  value: string
  onChange: (value: string) => void
  onKeyDown: (evt: KeyboardEvent) => void
  onBlur: () => void
  isFocused: boolean
}

function ValueInput(props: ValueInputProps) {
  const { value } = props

  if (value.startsWith("=")) {
    return <TextInput {...props} />
  }

  return <TextInput {...props} />
}

function TextInput({ innerRef, value, onChange, onKeyDown, onBlur, isFocused }: ValueInputProps) {
  const _onChange = useStaticCallback(() => {
    const currentContent = innerRef.current

    if (!currentContent) {
      return
    }

    // todo: this is aweful, but for some reason if you read the content on the same frame it's empty ¯\_(ツ)_/¯
    setTimeout(() => {
      onChange(currentContent.innerText)
    })
  })

  return (
    <ContentEditable
      innerRef={innerRef}
      html={value}
      onChange={_onChange}
      onKeyDown={onKeyDown}
      style={
        isFocused && value === ""
          ? {
              minWidth: "5px",
            }
          : undefined
      }
      onBlur={onBlur}
    />
  )
}
