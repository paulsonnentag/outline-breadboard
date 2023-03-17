import { KeyboardEvent, useCallback, useState } from "react"
import ContentEditable from "react-contenteditable"
import { NodeValueViewProps } from "./OutlineEditor"
import { isArrowDown, isArrowUp, isBackspace, isEnter, isEscape } from "./keyboardEvents"
import { getCaretCharacterOffset, mod } from "./utils"
import { useStaticCallback } from "./hooks"
import { createNode, getNode, Graph, isRef, useGraph } from "./graph"
import { InputProperty, LatLongProperty } from "./views/MapNodeView"
import classNames from "classnames"

interface TextNodeValueView extends NodeValueViewProps {
  value: string
}

// Future: A schema for commands. Until we know its shape in more cases, hardcoding.
interface Command {
  title: string
  action: (graph: Graph, nodeId: string) => void // this get's passed in a mutable graph
  tabAction?: () => void
}

const COMMANDS: Command[] = [
  {
    title: "Use map view",
    action: (graph, nodeId) => {
      const node = getNode(graph, nodeId)

      // This logic should be elsewhere; starting here until we can see a clear protocol
      // It should also be made generic; action could simply state expected inputs

      const indexOfInput = InputProperty.getChildIndexesOfNode(graph, nodeId)[0]

      if (indexOfInput === undefined) {
        const input = createNode(graph, { value: "input:" })

        input.children.push(
          createNode(graph, {
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
        const input = createNode(graph, { value: "input:" })

        // Look for default pos
        const indexOfPos = LatLongProperty.getChildIndexesOfNode(graph, nodeId)[0]

        if (indexOfPos === undefined) {
          input.children.push(
            createNode(graph, {
              value: "position: 37.2296, -80.4139",
            }).id
          )
        } else {
          const posId = node.children[indexOfPos]
          const value = getNode(graph, posId).value ?? "position: 37.2296, -80.4139"
          input.children.push(
            createNode(graph, {
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
}: TextNodeValueView) {
  const { changeGraph } = useGraph()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedItemIndex, setSelectedItemIndex] = useState(0)
  const commandString = getCommandString(value)

  const commands =
    commandString !== undefined && isMenuOpen
      ? COMMANDS.filter((command) => command.title.includes(commandString.trim()))
      : []

  const selectedCommand = commands[Math.min(selectedItemIndex, commands.length - 1)]

  const _onChange = useCallback(() => {
    const currentContent = innerRef.current

    if (!currentContent) {
      return
    }

    // todo: this is aweful, but for some reason if you read the content on the same frame it's empty ¯\_(ツ)_/¯
    setTimeout(() => {
      const newValue = currentContent.innerText

      if (
        (!newValue.includes("/") ||
          (innerRef.current && getCaretCharacterOffset(innerRef.current) !== newValue.length)) &&
        isMenuOpen
      ) {
        setIsMenuOpen(false)
      }

      onChange(newValue)
    })
  }, [onChange, isMenuOpen])

  const _onBlur = useCallback(() => {
    setIsMenuOpen(false)
  }, [onBlur])

  const onKeyDown = useStaticCallback((evt: KeyboardEvent) => {
    if (evt.key === "/") {
      setIsMenuOpen(true)
      setSelectedItemIndex(0)
      return
    }

    if (isBackspace(evt)) {
      if (value.endsWith("/")) {
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

          if (isRef(node.value)) {
            // this doesn't handle refs that reference other refs, but that case shouldn't occur
            node = getNode<string>(graph, node.value.id)
          }

          node.value = node.value.slice(0, -(commandString!.length + 1))
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
    <div className="relative w-full">
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
        onBlur={_onBlur}
      />

      {isMenuOpen && (
        <div className="absolute z-30 rounded p-1 bg-slate-100 shadow-md w-56 text-sm">
          {commands.map((command) => (
            <div
              key={command.title}
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

const COMMAND_REGEX = /\/([^/]*)$/

function getCommandString(value: string): string | undefined {
  const match = value.match(COMMAND_REGEX)

  return match ? match[1] : undefined
}
