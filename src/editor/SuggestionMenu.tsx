import classNames from "classnames"
import { useState, useEffect } from "react"
import { getGraph, getNode, useGraph } from "../graph"
import { suggestionToExprSource } from "./TextInput"
import { parseExpression } from '../language'
import { Scope } from "../language/scopes"
import { FUNCTIONS } from "../language/functions"
import { valueToString } from "./plugins/expressionResultPlugin"

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
  scope: Scope,
  suggestions: Suggestion[]
  focusedIndex: number
  selectSuggestion: (suggestion: Suggestion) => void
}

export function SuggestionMenu(props: SuggestionMenuProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined)

  return (
    <div className="bg-gray-100 border border-gray-300 rounded">
      {props.suggestions.map((s, i) =>
        <SuggestionRow
          scope={props.scope}
          key={i}
          suggestion={s}
          isFocused={hoveredIndex === i || (hoveredIndex === undefined && props.focusedIndex === i)}
          onHover={() => { setHoveredIndex(i) }} /* override keyboard focus for i */
          onUnhover={() => { hoveredIndex === i && setHoveredIndex(undefined) }} /* return to keyboard's focus if currently set to i */
          onClick={() => { props.selectSuggestion(s) }} /* should also trigger with return key */
        />
      )}
    </div>
  )
}

interface SuggestionRowProps {
  suggestion: Suggestion
  scope: Scope,
  isFocused: boolean
  onHover: () => void
  onUnhover: () => void
  onClick: () => void
}

function SuggestionRow({ suggestion, scope, isFocused, onHover, onUnhover, onClick }: SuggestionRowProps) {
  const [result, setResult] = useState<string | undefined>(undefined)

  useEffect(() => {
    const expr = suggestionToExprSource(suggestion)

    console.log("eval", expr, parseExpression(expr))

    parseExpression(expr).eval(scope).then(result => {
      console.log("result", result);

      setResult(result)
    })
  }, [])

  const summaryView = (suggestion.title && FUNCTIONS[suggestion.title].summaryView) ?? valueToString(result)


  return (
    <div
      className={classNames("py-2 px-3 flex items-center gap-1", { "bg-gray-300": isFocused })}
      onMouseEnter={e => onHover()}
      onMouseLeave={e => onUnhover()}
      onClick={e => onClick()}
    >
      <span className={classNames("material-icons-outlined font-normal text-sm mr-1", { "opacity-50": suggestion.icon === undefined })}>
        {suggestion.icon || "data_object"}
      </span>

      <p className="font-medium">{suggestion.title}</p>

      {suggestion.arguments?.map((a, i) => (a.value !== undefined &&
        <p key={i}>
          <span className="text-gray-500 inline-block mr-1">{a.label}</span>
          <span className="font-medium text-blue-600">{
            expressionToLabel(a.value)
          }</span>
        </p>
      ))}

      {result &&
        <p className="italic text-purple-600">{valueToString(result)}</p>
      }
    </div>
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
