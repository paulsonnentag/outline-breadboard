import { createValueNode, getGraph, Graph, Node } from "../../graph"
import { Completion, CompletionContext } from "@codemirror/autocomplete"
import { isString } from "../../utils"
import { placesAutocompleteApi } from "../../google"
import { createPlaceNode } from "../../views/MapNodeView"
import { scopeFacet } from "./state"
import { KEYWORD_REGEX } from "../../language"
import { REF_ID_REGEX } from "./refIdTokenPlugin"
import { createFlightNode } from "../../flights"
import { AIRLABS_API_KEY } from "../../api-keys"

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
    const flightsOptions = await getFlightsAutocompletion(search, graph, changeGraph)

    const timeOptions = getTimesAutocompletion(search, graph, changeGraph)
    const dateOptions = getDatesAutocompletion(search, graph, changeGraph)

    const nodeOptions: Completion[] = Object.values(graph).flatMap((node: Node) => {
      if (
        scope.isInScope(node.id) || // avoid circular references
        node.type !== "value" ||
        node.value.match(KEYWORD_REGEX) || // don't suggest nodes that are a property
        node.value.match(REF_ID_REGEX) || // don't suggest nodes that are transclusions
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
      options: dateOptions.concat(timeOptions).concat(nodeOptions).concat(flightsOptions).concat(placesOptions),
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

const FLIGHTS_REGEX = /[A-Z]{2}\d{1,4}/

async function getFlightsAutocompletion(
  search: string,
  graph: Graph,
  changeGraph: (fn: (graph: Graph) => void) => void
): Promise<Completion[]> {
  if (search === "") {
    return []
  }

  if (!search.match(FLIGHTS_REGEX)) {
    return []
  }

  const response = await fetch(
    [
      "https://airlabs.co/api/v9/flight",
      `?api_key=${AIRLABS_API_KEY}`,
      `&flight_iata=${search}`,
    ].join("")
  ).then((response) => response.json())
  if (response.error) {
    return []
  }

  const flight = response.response
  const flightNodeId = `flight-${flight.flight_iata}`

  return [
    {
      label: flight.flight_iata,
      apply: async (view, completion, from, to) => {
        await createFlightNode(changeGraph, flight.flight_iata)
        view.dispatch(
          view.state.update({
            changes: {
              from: from,
              to: to,
              insert: `#[${flightNodeId}]`,
            },
          })
        )
      },
    } as Completion,
  ]
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

function getTimesAutocompletion(
  search: string,
  graph: Graph,
  changeGraph: (fn: (graph: Graph) => void) => void
): Completion[] {
  const match = search.match(TIME_REGEX)

  if (match) {
    const timeString = search

    // if date node already exists and search matches canonical form we don't need to add a suggestion
    // because the default node search will already suggest the date node
    if (graph[timeString]) {
      return []
    }

    return [
      {
        label: timeString,
        apply: (view, completion, from, to) => {
          if (!graph[timeString]) {
            changeGraph((graph) => {
              const node = createValueNode(graph, { id: timeString, value: timeString })
              const attribute = createValueNode(graph, { value: `time: ${timeString}` })
              node.children.push(attribute.id)
            })
          }
          setTimeout(() => {
            view.dispatch(
              view.state.update({
                changes: {
                  from: from,
                  to: to,
                  insert: `#[${timeString}]`,
                },
              })
            )
          })
        },
      },
    ]
  }

  // If you have typed one or two digits, suggest the :00 + quarters
  const digitsRegex = /^\d{1,2}$/
  const digitsMatch = search.match(digitsRegex)

  if (digitsMatch) {
    return [":00", ":15", ":30", ":45"].map(mins => {
      const timeString = search.padStart(2, "0") + mins

      if (graph[timeString]) {
        return undefined
      }

      return {
        label: timeString,
        apply: (view: { dispatch: (arg0: any) => void; state: { update: (arg0: { changes: { from: any; to: any; insert: string } }) => any } }, completion: any, from: any, to: any) => {
          if (!graph[timeString]) {
            changeGraph((graph) => {
              const node = createValueNode(graph, { id: timeString, value: timeString })
              const attribute = createValueNode(graph, { value: `time: ${timeString}` })
              node.children.push(attribute.id)
            })
          }
          setTimeout(() => {
            view.dispatch(
              view.state.update({
                changes: {
                  from: from,
                  to: to,
                  insert: `#[${timeString}]`,
                },
              })
            )
          })
        },
      }
    })
    .filter(v => v !== undefined) as Completion[]
  }

  return []
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
