import { FunctionDefs } from "./index"
import { getPropertyOfNode } from "../scopes"

export const CORE_FNS: FunctionDefs = {
  Get: {
    function: async ([object, key], _, parentNodeIds, selfId) => {
      if (!object || !key) {
        return undefined
      }

      if (!object.id) {
        return undefined
      }

      return getPropertyOfNode(parentNodeIds, object.id, key)

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
    function: async (args) => args.reduce((accumulator, element) => accumulator || element),
    arguments: {
      "values, ...": "The boolean values to perform OR across.",
    },
  },
  Not: {
    function: async ([arg]) => !arg,
    arguments: {
      "values, ...": "The boolean values to perform NOT across.",
    },
  },
  LessThan: {
    function: async ([a, b]) => a < b,
    arguments: {
      arg: "The numeric value to compare to 'compareValue'",
      compareValue: "The value to check if it is greater than 'arg'",
    },
  },
  GreaterThan: {
    function: async ([a, b]) => a > b,
    arguments: {
      arg: "The numeric value to compare to 'compareValue'",
      compareValue: "The value to check if it is greater than 'arg'",
    },
  },
  Divide: {
    function: async ([x, y]) => x / y,
    description: "Divides one numeric value by another.",
  },
  Multiply: {
    function: async ([x, y]) => x * y,
    description: "Multiplies two numeric values together.",
  },
  Plus: {
    function: async ([x, y]) => x + y,
    description: "Adds two numeric values together.",
  },
  Minus: {
    function: async ([x, y]) => x - y,
    description: "Subtracts one numeric value from another.",
  },
  Round: {
    function: async ([x]) => Math.round(x),
    arguments: {
      numeric: "The numeric value to round to integers.",
    },
  },
}
