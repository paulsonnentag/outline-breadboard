import { FunctionDefs } from "./index"
import { valueOfAsync } from "../scopes"

export const CORE_FNS: FunctionDefs = {
  Get: {
    function: async ([object, key], _, scope) => {
      if (!object || !key) {
        return undefined
      }

      return object.get(key)
    },
  },
  Not: {
    function: async ([arg]) => !(await valueOfAsync(arg)),
  },
  LessThan: {
    function: async ([a, b]) => (await valueOfAsync(a)) < (await valueOfAsync(b)),
  },
  GreaterThan: {
    function: async ([a, b]) => (await valueOfAsync(a)) > (await valueOfAsync(b)),
  },
  Divide: {
    function: async ([x, y]) =>
      parseFloat(await valueOfAsync(x)) / parseFloat(await valueOfAsync(y)),
  },
  Multiply: {
    function: async ([x, y]) =>
      parseFloat(await valueOfAsync(x)) * parseFloat(await valueOfAsync(y)),
  },
  Plus: {
    function: async ([x, y]) =>
      parseFloat(await valueOfAsync(x)) + parseFloat(await valueOfAsync(y)),
  },
  Minus: {
    function: async ([x, y]) =>
      parseFloat(await valueOfAsync(x)) - parseFloat(await valueOfAsync(y)),
  },
  Round: {
    function: async ([x]) => Math.round(parseFloat(await valueOfAsync(x))),
  },
}
