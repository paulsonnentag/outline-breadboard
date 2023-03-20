import * as ohm from "ohm-js"
import { getNode, Graph, ValueNode } from "./graph"

// An object to store results of calling functions
const functionCache: { [key: string]: any } = {}

const GRAMMAR_SRC = `
Formula {
  Formula
    = "=" Exp

  Exp = AddExp

  SimpleExp 
    = AccessExp
    | FunctionExp
    | StringLiteral
    | NumberLiteral
    | IdRef

  AccessExp
    = SimpleExp "." PropertyName
  
  PropertyName 
    = PropertyChar+
    
  PropertyChar
    = alnum+ | "_"

  StringLiteral
    = "\\\"" StringChar+ "\\\""

  NumberLiteral
    = digit+

  IdRefChar
  	= alnum+ | "_" | "-"

  IdRef
    = "@{" IdRefChar+ "}"

  StringChar
    = alnum | "." | ":" | ">" | "-" | "(" | ")" | "[" | "]" | "=" | "'" | "/" | "*" | "!" | "$" | "_"

  FunctionExp
    = letter+ "(" ListOf<Exp, ","> ")"

  AddExp
    = AddExp "+" MulExp --plus
    | AddExp "-" MulExp --minus
    | MulExp

  MulExp
    = MulExp "*" SimpleExp --times
    | MulExp "/" SimpleExp --divide
    | SimpleExp
}
`

function promisify(value: any) {
  return new Promise((resolve, _) => {
    resolve(value)
  })
}

interface FunctionDef {
  function: (args: any[], graph: Graph) => any
  arguments?: {
    [arg: string]: string
  }
  description?: string
}

const functions: { [name: string]: FunctionDef } = {
  Get: {
    function: ([object, key], graph) => {
      if (!object || !object.children || !key) {
        return undefined
      }

      const valueNode = object.children
        .map((childId: string) => getNode(graph, childId))
        .find((childNode: ValueNode<any>) => {
          console.log(childNode.key, key)

          return childNode.key === key
        })

      return promisify(valueNode ? valueNode.value : undefined)
    },
  },

  And: {
    function: (args) => {
      return promisify(args.reduce((accumulator, element) => accumulator && element))
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

const formulaGrammar = ohm.grammar(GRAMMAR_SRC)

const formulaSemantics = formulaGrammar.createSemantics().addOperation("toAst", {
  Formula: (eq, e) => e.toAst(),
  Exp: function (e) {
    return e.toAst()
  },
  SimpleExp: (e) => e.toAst(),
  FunctionExp: function (fnName, _p1, args, _p2) {
    return new FnNode(fnName.sourceString, args.asIteration().toAst())
  },
  IdRef: (fo, chars, bar) => new IdRefNode(chars.sourceString),
  StringLiteral: function (_q1, string, _q2) {
    return new StringNode(string.sourceString)
  },
  NumberLiteral: (num) => new NumberNode(num.sourceString),
  MulExp_times: (a, _, b) =>
    new FnNode(
      "Multiply",
      [a, b].map((x) => x.toAst())
    ),
  MulExp_divide: (a, _, b) =>
    new FnNode(
      "Divide",
      [a, b].map((x) => x.toAst())
    ),
  AddExp_plus: (a, _, b) =>
    new FnNode(
      "Plus",
      [a, b].map((x) => x.toAst())
    ),
  AddExp_minus: (a, _, b) =>
    new FnNode(
      "Minus",
      [a, b].map((x) => x.toAst())
    ),

  AccessExp: (obj, _, key) =>
    new FnNode(
      "Get",
      [obj, key].map((x) => x.toAst())
    ),

  PropertyName: (name) => new StringNode(name.sourceString),
})

interface AstNode {
  eval: (graph: Graph) => any
  getIdRefs: () => string[]
}

class FnNode implements AstNode {
  fnName: string
  args: Array<any>

  constructor(fnName: string, args: any[]) {
    this.fnName = fnName
    this.args = args
  }

  eval(graph: Graph) {
    let fn = functions[this.fnName]["function"]
    if (!fn) {
      return null
    }
    return Promise.all(this.args.map((arg) => arg.eval(graph))).then((values) => {
      // Compute a cache key representing executing this function on these inputs
      // of the form "FunctionName:RowId:Arg1:Arg2".
      // Then look it up in our in-memory cache. (the cache isn't persisted,
      // it's just there to make re-evals smoother within pageloads)

      /* const cacheKey = `${this.fnName}:${values.join("_:_")}`

      if (functionCache[cacheKey]) {
        //console.log("FROM CACHE:", this.fnName, row.id, values[0].tagName, values[1]);
        return functionCache[cacheKey]
      } else { */
      const result = fn(values, graph)
      // functionCache[cacheKey] = result
      //console.log("COMPUTED:", this.fnName, row.id, values[0].tagName, values[1]);
      return result
      // }
    })
  }

  getIdRefs(): string[] {
    const idMap: { [id: string]: boolean } = {}

    for (const arg of this.args) {
      for (const id of arg.getIdRefs) {
        idMap[id] = true
      }
    }

    return Object.keys(idMap)
  }
}

class IdRefNode implements AstNode {
  constructor(readonly id: string) {}

  eval(graph: Graph) {
    return promisify(getNode(graph, this.id))
  }

  getIdRefs(): string[] {
    return [this.id]
  }
}

class StringNode implements AstNode {
  constructor(readonly string: string) {}

  eval(graph: Graph) {
    return promisify(this.string)
  }

  getIdRefs(): string[] {
    return []
  }
}

class NumberNode implements AstNode {
  number: number

  constructor(num: string) {
    this.number = parseFloat(num)
  }

  eval(graph: Graph) {
    return promisify(this.number)
  }

  getIdRefs(): string[] {
    return []
  }
}

class Formula implements AstNode {
  src: string
  match: any

  constructor(src: string, match: any) {
    this.src = src
    this.match = match
  }

  eval(graph: Graph) {
    // A deleted formula evaluates to empty
    if (this.src === "") {
      return null
    }

    if (this.match.succeeded()) {
      return formulaSemantics(this.match).toAst().eval(graph)
    } else {
      // console.error(`Couldn't parse formula: ${this.match.message}`)
      return `Error: ${this.match.message}`
    }
  }

  getIdRefs(): string[] {
    if (this.src === "") {
      return []
    }

    if (this.match.succeeded()) {
      return formulaSemantics(this.match).toAst().getIdRefs()
    }

    console.error(`Couldn't parse formula: ${this.match.message}`)
    return []
  }
}

export function parseFormula(source: string): Formula | null {
  if (source === null || source[0] !== "=") {
    return null
  } else {
    return new Formula(source, formulaGrammar.match(source))
  }
}
