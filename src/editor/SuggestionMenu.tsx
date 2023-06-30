import classNames from "classnames"
import { useEffect, useState } from "react"
import { getGraph, getNode, Graph, useGraph } from "../graph"
import { suggestionToExprSource } from "./TextInput"
import { ALIAS_REGEX, parseExpression } from "../language"
import { Scope } from "../language/scopes"
import { valueToString } from "./plugins/expressionResultPlugin"
import { HAS_MISSING_ARGUMENTS_VALUE } from "../language/functions/function-def"
import { IdRefNode } from "../language/ast"
import { FUNCTIONS } from "../language/functions"
import { FunctionSuggestionWithText, getSuggestedFunctions } from "../language/function-suggestions"
import { getSuggestedMentions } from "./mentions"
import { fuzzyMatch } from "../utils"

export interface MentionSuggestionValue {
  type: "mention"
  name: string
  expression: string
}

export interface FunctionSuggestionValue {
  type: "function"
  name: string
  text: string
  arguments: SuggestionArgument[]
}

type SuggestionValue = MentionSuggestionValue | FunctionSuggestionValue

export interface Suggestion {
  value: SuggestionValue
  icon?: string
  beforeInsert?: (graph: Graph, changeGraph: (fn: (graph: Graph) => void) => void) => Promise<void>
  rank?: number
}

interface SuggestionArgument {
  label: string
  expression?: string
  hidden?: boolean
  // color?: string // todo
}

interface SuggestionMenuProps {
  scope: Scope
  search: string
  mode: "functions" | "mentions"
  suggestions: Suggestion[]
  onChangeSuggestions: (suggestions: Suggestion[]) => void
  focusedIndex: number
  onSelectSuggestion: (suggestion: Suggestion) => void
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

export function SuggestionMenu({
  search,
  mode,
  focusedIndex,
  scope,
  isHoveringOverId,
  suggestions,
  setIsHoveringOverId,
  onSelectSuggestion,
  onChangeSuggestions,
}: SuggestionMenuProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined)

  // load suggestions
  useEffect(() => {
    if (search === undefined) {
      return
    }

    getSuggestions(scope, search, mode).then((newSuggestions: Suggestion[]) => {
      onChangeSuggestions(newSuggestions)
    })
  }, [search])

  return (
    <div className="bg-gray-100 border border-gray-300 rounded">
      {suggestions.map((suggestion, index) => (
        <SuggestionRow
          scope={scope}
          key={index}
          suggestion={suggestion}
          isFocused={
            hoveredIndex === index || (hoveredIndex === undefined && focusedIndex === index)
          }
          onHover={() => {
            setHoveredIndex(index)
          }} /* override keyboard focus for i */
          onUnhover={() => {
            hoveredIndex === index && setHoveredIndex(undefined)
          }} /* return to keyboard's focus if currently set to i */
          onClick={() => {
            onSelectSuggestion(suggestion)
          }} /* should also trigger with return key */
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      ))}

      {suggestions.length === 0 && (
        <div className="py-2 px-3 flex items-center gap-1 text-gray-400">no results</div>
      )}
    </div>
  )
}

const MAX_SUGGESTIONS = 10

async function getSuggestions(
  scope: Scope,
  search: string,
  mode: "mentions" | "functions"
): Promise<Suggestion[]> {
  switch (mode) {
    case "mentions":
      return (await getSuggestedMentions(scope, search)).slice(0, MAX_SUGGESTIONS)

    case "functions":
      const graph = getGraph()
      return getSuggestedFunctions(scope, graph)
        .filter((suggestion) => fuzzyMatch(suggestion.text.toLowerCase(), search.toLowerCase()))
        .slice(0, MAX_SUGGESTIONS)
        .map((suggestion: FunctionSuggestionWithText) => {
          return {
            value: {
              type: "function",
              name: suggestion.name,
              arguments: suggestion.arguments,
              text: suggestion.text,
            },
            icon: suggestion.icon,
          }
        })
  }
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
  scope,
  suggestion,
  isFocused,
  onHover,
  onUnhover,
  onClick,
  isHoveringOverId,
  setIsHoveringOverId,
}: SuggestionRowProps) {
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

      {suggestion.value.type === "mention" && (
        <MentionSuggestionValueView value={suggestion.value} />
      )}

      {suggestion.value.type === "function" && (
        <FunctionSuggestionValueView
          value={suggestion.value}
          scope={scope}
          isHoveringOverId={isHoveringOverId}
          setIsHoveringOverId={setIsHoveringOverId}
        />
      )}
    </div>
  )
}

interface MentionSuggestionsValueViewProps {
  value: MentionSuggestionValue
}

function MentionSuggestionValueView({ value }: MentionSuggestionsValueViewProps) {
  return <p className="font-medium">{value.name}</p>
}

interface FunctionSuggestionValueViewProps {
  value: FunctionSuggestionValue
  scope: Scope
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function FunctionSuggestionValueView({
  value,
  scope,
  isHoveringOverId,
  setIsHoveringOverId,
}: FunctionSuggestionValueViewProps) {
  const { graph } = useGraph()
  const [result, setResult] = useState<string | undefined>(undefined)

  useEffect(() => {
    const expr = suggestionToExprSource(value)

    const parametersScopes: Scope[] = []

    for (const arg of value.arguments) {
      if (!arg.expression) {
        continue
      }

      const ast = parseExpression(arg.expression)

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
  }, [scope])

  const fn = FUNCTIONS[value.name]
  const summaryView = fn && fn.summaryView !== undefined ? fn.summaryView : valueToString

  return (
    <>
      <p className="font-medium">{value.name}</p>

      {value.arguments?.map(
        (a, i) =>
          a.expression !== undefined &&
          !a.hidden && (
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

      {result !== undefined && <p className="italic text-purple-600">= {summaryView(result)}</p>}
    </>
  )
}

interface ArgumentValueProps {
  argument: SuggestionArgument
  isHoveringOverId: string | undefined
  setIsHoveringOverId: (nodeId: string | undefined) => void
}

function ArgumentValue(props: ArgumentValueProps) {
  const mentionId = props.argument.expression?.match(/#\[(.*?)\]/)?.[1]

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
      {props.argument.expression && expressionToLabel(props.argument.expression)}
    </span>
  )
}

function expressionToLabel(expression: string) {
  const graph = getGraph()

  return expression
    .replace(/#\[([^\]]+)]/g, (match, id) => {
      const value = getNode(graph, id).value

      const aliasMatch = value.match(ALIAS_REGEX)
      if (aliasMatch) {
        return aliasMatch[1]
      }

      return value
    })
    .replace("$", "")
}
