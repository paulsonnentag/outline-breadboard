import { promisify } from "../../utils"
import { readProperty } from "../../properties"
import { FunctionDefs } from "./index"
import { getValueOfNode, lookupName, Scopes } from "../scopes"
import { getNode } from "../../graph"

export const CORE_FNS: FunctionDefs = {
  Get: {
    function: async ([object, key], _, parentNodeIds, selfId) => {
      if (!object || !key) {
        return undefined
      }

      const nodeId = object.props[key]

      if (!nodeId) {
        return undefined
      }

      return getValueOfNode(parentNodeIds, nodeId)

      /*
      if (!object || !key) {
        return promisify(undefined)
      }

      // assume it's a plain object if it has no children and no computedProps
      if (!Array.isArray(object.children) && !object.computedProps) {
        return promisify(object[key])
      }

      // try to access property on node itself

      const value = readProperty(graph, object.id, key)

      if (value !== undefined) {
        return promisify(value)
      }

      // try to access computed property
      if (object.computedProps[key]) {
        return object.computedProps[key]
      }

      // otherwise interpret node as list

      return promisify(
        object.children.flatMap((childId: string) => {
          const value = readProperty(graph, childId, key)

          if (value === undefined) {
            return []
          }

          return value
        })
      ) */
    },
  },

  And: {
    function: async (args) => {
      return args.reduce((accumulator, element) => accumulator && element)
    },
    arguments: {
      "values, ...": "The boolean values to perform AND across.",
    },
  },
  Or: {
    function: (args) => promisify(args.reduce((accumulator, element) => accumulator || element)),
    arguments: {
      "values, ...": "The boolean values to perform OR across.",
    },
  },
  Not: {
    function: ([arg]) => promisify(!arg),
    arguments: {
      "values, ...": "The boolean values to perform NOT across.",
    },
  },
  LessThan: {
    function: ([a, b]) => promisify(a < b),
    arguments: {
      arg: "The numeric value to compare to 'compareValue'",
      compareValue: "The value to check if it is greater than 'arg'",
    },
  },
  GreaterThan: {
    function: ([a, b]) => promisify(a > b),
    arguments: {
      arg: "The numeric value to compare to 'compareValue'",
      compareValue: "The value to check if it is greater than 'arg'",
    },
  },
  Divide: {
    function: ([x, y]) => promisify(x / y),
    description: "Divides one numeric value by another.",
  },
  Multiply: {
    function: ([x, y]) => promisify(x * y),
    description: "Multiplies two numeric values together.",
  },
  Plus: {
    function: ([x, y]) => promisify(parseFloat(x) + parseFloat(y)),
    description: "Adds two numeric values together.",
  },
  Minus: {
    function: ([x, y]) => promisify(x - y),
    description: "Subtracts one numeric value from another.",
  },
  Round: {
    function: ([x]) => promisify(Math.round(x)),
    arguments: {
      numeric: "The numeric value to round to integers.",
    },
  },
}
