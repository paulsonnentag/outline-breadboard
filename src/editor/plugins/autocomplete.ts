import { createValueNode, getGraph, getNode, Graph, Node } from "../../graph"
import { Completion, CompletionContext } from "@codemirror/autocomplete"
import { isString } from "../../utils"
import { placesAutocompleteApi } from "../../google"
import { createPlaceNode } from "../../views/MapNodeView"
import { scopeFacet } from "./state"
import { KEYWORD_REGEX } from "../../language"
import { getSuggestedFunctions } from "../../language/relationships"

export function getMentionCompletionContext(changeGraph: (fn: (graph: Graph) => void) => void) {
  return async function mentionCompletionContext(context: CompletionContext) {
    const scope = context.state.facet(scopeFacet)

    let reference = context.matchBefore(/@[^@]*/)

    if (reference === null) {
      return null
    }

    const graph = getGraph()
    const search = reference.text.toString().slice(1).trim()

    const placesOptions = await getPlacesAutocompletion(search, graph, changeGraph)

    const dateOptions = getDatesAutocompletion(search, graph, changeGraph)

    const nodeOptions: Completion[] = Object.values(graph).flatMap((node: Node) => {
      if (
        scope.isInScope(node.id) || // avoid circular references
        node.type !== "value" ||
        node.value.match(KEYWORD_REGEX) || // don't suggest nodes that are a property
        !isString(node.value) ||
        node.value === "" ||
        node.value.startsWith("=") ||
        !node.value.toLowerCase().includes(search.toLowerCase()) ||
        node.value.includes("{") // don't suggest nodes that contain an expression
      ) {
        return []
      }

      return [{ label: node.value, apply: `#[${node.id}]` }]
    })

    return {
      from: reference.from,
      filter: false,
      options: dateOptions.concat(nodeOptions).concat(placesOptions),
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

const DATE_REGEX = /^([0-9]{1,2})\/([0-9]{1,2})(\/([0-9]{2}|[0-9]{4}))?$/

function getDatesAutocompletion(
  search: string,
  graph: Graph,
  changeGraph: (fn: (graph: Graph) => void) => void
): Completion[] {
  const match = search.match(DATE_REGEX)

  if (!match) {
    return []
  }

  // where going here with the peculiar convention where month comes before day
  const yearString = match[4]
  const month = parseInt(match[1], 10)
  const day = parseInt(match[2], 10)
  const year =
    yearString !== undefined
      ? parseInt(yearString.length === 2 ? `20${yearString}` : yearString)
      : new Date().getFullYear()

  // todo: doesn't check if date is valid
  const date = `${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}/${year}`

  // if date node already exists and search matches canonical form we don't need to add a suggestion
  // because the default node search will already suggest the date node
  if (graph[date] && search === date) {
    return []
  }

  return [
    {
      label: date,
      apply: (view, completion, from, to) => {
        if (!graph[date]) {
          changeGraph((graph) => {
            const node = createValueNode(graph, { id: date, value: date })
            const attribute = createValueNode(graph, { value: `date: ${date}` })
            node.children.push(attribute.id)
          })
        }
        setTimeout(() => {
          view.dispatch(
            view.state.update({
              changes: {
                from: from,
                to: to,
                insert: `#[${date}]`,
              },
            })
          )
        })
      },
    },
  ]
}

function expressionToLabel(expression: string) {
  const graph = getGraph()
  return expression
    .replace(/#\[([^\]]+)]/g, (match, id) => {
      return getNode(graph, id).value
    })
    .replace("$", "")
}

export function functionAutocompletionContext(context: CompletionContext) {
  let reference = context.matchBefore(/\/.*/)

  if (reference === null) {
    return null
  }

  const search = reference.text.toString().slice(1).trim().toLowerCase()
  const scope = context.state.facet(scopeFacet)

  const options = getSuggestedFunctions(scope)
    .filter((suggestion) => expressionToLabel(suggestion.expression).toLowerCase().includes(search))
    .map(({ expression }) => {
      const inlineExpr = `{${expression}}`

      return {
        label: expressionToLabel(expression),
        apply: (view, completion, from, to) => {
          const indexOfDollarSign = inlineExpr.indexOf("$")
          const cursorOffset = indexOfDollarSign !== -1 ? indexOfDollarSign : inlineExpr.length

          view.dispatch(
            view.state.update({
              changes: {
                from: from,
                to: to,
                insert:
                  indexOfDollarSign !== -1
                    ? inlineExpr.slice(0, indexOfDollarSign) +
                      inlineExpr.slice(indexOfDollarSign + 1)
                    : inlineExpr,
              },
              selection: {
                anchor: from + cursorOffset,
                head: from + cursorOffset,
              },
            })
          )
        },
      } as Completion
    })

  return {
    from: reference.from,
    filter: false,
    options,
  }
}
