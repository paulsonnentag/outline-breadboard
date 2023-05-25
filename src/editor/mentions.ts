import { createValueNode, getGraph, getGraphDocHandle, getNode, Graph, Node } from "../graph"
import { ALIAS_REGEX, KEYWORD_REGEX } from "../language"
import { REF_ID_REGEX } from "./plugins/refIdTokenPlugin"
import { fuzzyMatch, isString, rankedFuzzyMatch } from "../utils"
import { placesAutocompleteApi } from "../google"
import { createPlaceNode } from "../views/MapNodeView"
import { createFlightNode } from "../flights"
import { Scope } from "../language/scopes"
import { Suggestion } from "./SuggestionMenu"
import { getParametersSorted } from "../language/function-suggestions"
import { sortBy } from "lodash"

// @ts-ignore
const AIRLABS_API_KEY = __APP_ENV__.AIRLABS_API_KEY

const ADDRESS_REGEX = /^shortAddress: (.*)$/
function getShortAddressOfNode(graph: Graph, nodeId: string): string | undefined {
  if (!graph[nodeId]) {
    return undefined
  }

  const node = getNode(graph, nodeId)
  for (const childId of node.children) {
    const childNode = getNode(graph, childId)

    const match = childNode.value.match(ADDRESS_REGEX)

    if (match) {
      return match[1]
    }
  }
}

function getNodeIdMapOfScope(scope: Scope): { [id: string]: boolean } {
  const nodeIdMap: { [id: string]: boolean } = {}

  addNodeIdsOfScopeToMap(scope, nodeIdMap)

  return nodeIdMap
}

function addNodeIdsOfScopeToMap(scope: Scope, nodeIdMap: { [id: string]: boolean }) {
  nodeIdMap[scope.id] = true
  scope.childScopes.forEach((childScope) => addNodeIdsOfScopeToMap(childScope, nodeIdMap))
  Object.values(scope.transcludedScopes).forEach((transcludedScope: Scope) =>
    addNodeIdsOfScopeToMap(transcludedScope, nodeIdMap)
  )
}

export async function getSuggestedMentions(scope: Scope, search: string): Promise<Suggestion[]> {
  let graph = getGraph()

  scope.getRootScope()

  await loadGooglePlacesSuggestions(graph, scope, search)

  // need to update graph because loadGooglePlacesSuggestions creates new nodes
  graph = getGraph()

  const flightsOptions = await getFlightsAutocompletion(graph, scope, search)

  const timeOptions = getTimesAutocompletion(graph, scope, search)
  const dateOptions = getDatesAutocompletion(graph, scope, search)
  const nodeOptions = getNodeAutocompletion(graph, scope, search)

  return dateOptions.concat(timeOptions).concat(flightsOptions).concat(nodeOptions)
}

function getNodeAutocompletion(graph: Graph, scope: Scope, search: string): Suggestion[] {
  if (search === "") {
    return []
  }

  const isNodeInDoc = getNodeIdMapOfScope(scope.getRootScope())

  const nodeOptions: Suggestion[] = []

  Object.values(graph).forEach((node: Node) => {
    if (
      scope.isInScope(node.id) || // avoid circular references
      node.type !== "value" ||
      !isString(node.value) ||
      node.value === ""
    ) {
      return
    }

    const isInDocBonus = isNodeInDoc[node.id] ? -1 : 0

    // alias
    if (node.value.match(ALIAS_REGEX)) {
      return nodeOptions.push({
        value: {
          type: "mention",
          name: node.value.match(KEYWORD_REGEX)![1],
          expression: `#[${node.id}]`,
        },
        rank: isInDocBonus,
      })
    }

    // excluded things like nodes with keywords, transclusions or expressions
    // only if they are not an alias
    if (
      node.value.match(KEYWORD_REGEX) || // don't suggest nodes that are a property
      node.value.match(REF_ID_REGEX) || // don't suggest nodes that are transclusions
      node.value.includes("{") // don't suggest nodes that contain an expression
    ) {
      return
    }

    // POI
    const shortAddress = getShortAddressOfNode(graph, node.id)

    if (shortAddress) {
      const value = `${node.value}, ${shortAddress}`
      const match = rankedFuzzyMatch(node.value.toLowerCase(), search.toLowerCase())

      if (match !== -1) {
        nodeOptions.push({
          icon: "location_on",
          value: {
            type: "mention",
            name: value,
            expression: `#[${node.id}]`,
          },
          rank: match + isInDocBonus,
        })
      }
      return
    }

    // regular nodes
    const match = rankedFuzzyMatch(node.value.toLowerCase(), search.toLowerCase())
    if (match !== -1) {
      // regular node
      return nodeOptions.push({
        value: {
          type: "mention",
          name: node.value,
          expression: `#[${node.id}]`,
        },
        rank: match + isInDocBonus,
      })
    }
  })

  return sortBy(nodeOptions, (option) => (option.rank !== undefined ? option.rank : Infinity))
}

async function loadGooglePlacesSuggestions(
  graph: Graph,
  scope: Scope,
  search: string
): Promise<void> {
  if (search === "") {
    return
  }

  // bias search result to show results near closest location in document
  const locationBias = getParametersSorted(scope).find(
    (parameter) => parameter.value.type === "location"
  )

  const result: google.maps.places.AutocompleteResponse = await placesAutocompleteApi.then(
    (autocomplete) =>
      autocomplete.getPlacePredictions(
        locationBias
          ? {
              input: search,
              radius: 5000, // 5 km
              // unfortunately we have to specify a radius, if we specify a bigger radius it only biases locations based
              // on weather they are in the radius not based on how close they are to the center
              location: new google.maps.LatLng(locationBias.value.value),
            }
          : { input: search }
      )
  )

  const handle = getGraphDocHandle()
  const changeGraph = (fn: (graph: Graph) => void) => {
    handle.change((doc) => fn(doc.graph))
  }

  await Promise.all(
    result.predictions.map(async (prediction): Promise<void> => {
      if (!graph[prediction.place_id]) {
        await createPlaceNode(changeGraph, prediction.place_id)
      }
    })
  )
}

const FLIGHTS_REGEX = /[A-Z\d]{2}\d{1,4}/

async function getFlightsAutocompletion(
  graph: Graph,
  scope: Scope,
  search: string
): Promise<Suggestion[]> {
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
      icon: "flight",
      value: {
        type: "mention",
        name: flight.flight_iata,
        expression: `#[${flightNodeId}]`,
      },
      beforeInsert: async (graph, changeGraph) => {
        await createFlightNode(changeGraph, flight.flight_iata)
      },
    } as Suggestion,
  ]
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

function getTimesAutocompletion(graph: Graph, scope: Scope, search: string): Suggestion[] {
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
        icon: "schedule",
        value: {
          type: "mention",
          name: timeString,
          expression: `#[${timeString}]`,
        },

        beforeInsert: (graph, changeGraph) => {
          if (!graph[timeString]) {
            changeGraph((graph) => {
              const node = createValueNode(graph, { id: timeString, value: timeString })
              const attribute = createValueNode(graph, { value: `time: ${timeString}` })
              node.children.push(attribute.id)
            })
          }
        },
      } as Suggestion,
    ]
  }

  // If you have typed one or two digits, suggest the :00 + quarters
  const digitsRegex = /^\d{1,2}$/
  const digitsMatch = search.match(digitsRegex)

  if (digitsMatch) {
    return [":00", ":15", ":30", ":45"]
      .map((mins) => {
        const timeString = search.padStart(2, "0") + mins

        if (graph[timeString]) {
          return undefined
        }

        return {
          icon: "schedule",
          value: {
            type: "mention",
            name: timeString,
            expression: `#[${timeString}]`,
          },

          beforeInsert: (graph, changeGraph) => {
            if (!graph[timeString]) {
              changeGraph((graph) => {
                const node = createValueNode(graph, { id: timeString, value: timeString })
                const attribute = createValueNode(graph, { value: `time: ${timeString}` })
                node.children.push(attribute.id)
              })
            }
          },
        } as Suggestion
      })
      .filter((v) => v !== undefined) as Suggestion[]
  }

  return []
}

const DATE_REGEX = /^([0-9]{1,2})\/([0-9]{1,2})(\/([0-9]{2}|[0-9]{4}))?$/

function getDatesAutocompletion(graph: Graph, scope: Scope, search: string): Suggestion[] {
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
      icon: "calendar_month",
      value: {
        type: "mention",
        name: date,
        expression: `#[${date}]`,
      },

      beforeInsert: async (graph, changeGraph) => {
        if (!graph[date]) {
          changeGraph((graph) => {
            const node = createValueNode(graph, { id: date, value: date })
            const attribute = createValueNode(graph, { value: `date: ${date}` })
            node.children.push(attribute.id)
          })
        }
      },
    },
  ]
}
