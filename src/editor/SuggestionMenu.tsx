import classNames from "classnames"
import { useEffect, useState } from "react"
import { getGraph, getNode, useGraph } from "../graph"
import { suggestionToExprSource } from "./TextInput"
import { parseExpression } from "../language"
import { Scope } from "../language/scopes"
import { valueToString } from "./plugins/expressionResultPlugin"
import { HAS_MISSING_ARGUMENTS_VALUE } from "../language/functions/function-def"
import { IdRefNode } from "../language/ast"
import { FUNCTIONS } from "../language/functions"

export interface Suggestion {
  icon?: string
  title: string
  arguments: SuggestionArgument[]
}

interface SuggestionArgument {
  label: string
  value?: string
  // color?: string // todo
}

interface SuggestionMenuProps {
  scope: Scope
  suggestions: Suggestion[]
  focusedIndex: number
  selectSuggestion: (suggestion: Suggestion) => void
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export function SuggestionMenu(props: SuggestionMenuProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined)

  return (
    <div className="bg-gray-100 border border-gray-300 rounded">
      {props.suggestions.map((s, i) => (
        <SuggestionRow
          scope={props.scope}
          key={i}
          suggestion={s}
          isFocused={hoveredIndex === i || (hoveredIndex === undefined && props.focusedIndex === i)}
          onHover={() => {
            setHoveredIndex(i)
          }} /* override keyboard focus for i */
          onUnhover={() => {
            hoveredIndex === i && setHoveredIndex(undefined)
          }} /* return to keyboard's focus if currently set to i */
          onClick={() => {
            props.selectSuggestion(s)
          }} /* should also trigger with return key */
          isHoveringOverId={props.isHoveringOverId}
          setIsHoveringOverId={props.setIsHoveringOverId}
        />
      ))}
    </div>
  )
}

interface SuggestionRowProps {
  suggestion: Suggestion
  scope: Scope
  isFocused: boolean
  onHover: () => void
  onUnhover: () => void
  onClick: () => void
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function SuggestionRow({
  suggestion,
  scope,
  isFocused,
  onHover,
  onUnhover,
  onClick,
  isHoveringOverId,
  setIsHoveringOverId,
}: SuggestionRowProps) {
  const { graph } = useGraph()
  const [result, setResult] = useState<string | undefined>(undefined)

  useEffect(() => {
    const expr = suggestionToExprSource(suggestion)

    const parametersScopes: Scope[] = []

    for (const arg of suggestion.arguments) {
      if (!arg.value) {
        continue
      }

      const ast = parseExpression(arg.value)

      if (ast instanceof IdRefNode) {
        const transcludedScope = new Scope(graph, ast.id, scope)
        transcludedScope.eval()
        parametersScopes.push(transcludedScope)
      }
    }

    const scopeWithParameters = scope.withTranscludedScopes(parametersScopes)

    parseExpression(expr)
      .eval(scopeWithParameters)
      .then((result) => {
        if (result !== HAS_MISSING_ARGUMENTS_VALUE) {
          setResult(result)
        }
      })
  }, [])

  const fn = FUNCTIONS[suggestion.title]
  const summaryView = fn && fn.summaryView !== undefined ? fn.summaryView : valueToString

  return (
    <div
      className={classNames("py-2 px-3 flex items-center gap-1", { "bg-gray-300": isFocused })}
      onMouseEnter={(e) => onHover()}
      onMouseLeave={(e) => onUnhover()}
      onClick={(e) => onClick()}
    >
      <span
        className={classNames("material-icons-outlined font-normal text-sm mr-1", {
          "opacity-50": suggestion.icon === undefined,
        })}
      >
        {suggestion.icon || "data_object"}
      </span>

      <p className="font-medium">{suggestion.title}</p>

      {suggestion.arguments?.map(
        (a, i) =>
          a.value !== undefined && (
            <p key={i}>
              <span className="text-gray-500 inline-block mr-1">{a.label}</span>
              <ArgumentValue
                argument={a}
                isHoveringOverId={isHoveringOverId}
                setIsHoveringOverId={setIsHoveringOverId}
              />
            </p>
          )
      )}

      {result && <p className="italic text-purple-600">= {summaryView(result)}</p>}
    </div>
  )
}

interface ArgumentValueProps {
  argument: SuggestionArgument
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function ArgumentValue(props: ArgumentValueProps) {
  const mentionId = props.argument.value?.match(/#\[(.*?)\]/)?.[1]

  return (
    <span
      className={classNames("font-medium text-blue-500 px-1 rounded", {
        "bg-blue-200": mentionId === props.isHoveringOverId,
      })}
      onMouseOver={(e) => mentionId && props.setIsHoveringOverId(mentionId)}
      onMouseLeave={(e) =>
        mentionId === props.isHoveringOverId && props.setIsHoveringOverId(undefined)
      }
    >
      {props.argument.value && expressionToLabel(props.argument.value)}
    </span>
  )
}

function expressionToLabel(expression: string) {
  const graph = getGraph()
  return expression
    .replace(/#\[([^\]]+)]/g, (match, id) => {
      return getNode(graph, id).value
    })
    .replace("$", "")
}
