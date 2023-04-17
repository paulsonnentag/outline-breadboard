import { grammar } from "./grammar"
import { Node } from "ohm-js"
import { isArray, promisify } from "../utils"
import { FUNCTIONS } from "./functions"
import { Scope } from "./scopes"

export const formulaSemantics = grammar.createSemantics().addOperation("toAst", {
  Bullet: (key, _, valueNode) => {
    const from = key.source.startIdx
    const to = valueNode.source.endIdx
    const keyString = key.sourceString.slice(0, -1)
    const hasKey = keyString !== ""

    let value = valueNode.toAst()[0]

    if (value === undefined) {
      value = []
    }

    if (!isArray(value)) {
      value = [value]
    }

    return new BulletNode(from, to, hasKey ? keyString : undefined, value)
  },

  TextLiteral: (e: Node) => new TextNode(e.source.startIdx, e.source.endIdx, e.sourceString),

  Exp: (e) => e.toAst(),

  SimpleExp: (e) => e.toAst(),
  InlineExp: (_, e, __) => {
    const from = _.source.startIdx
    const to = __.source.endIdx
    return new InlineExprNode(from, to, e.toAst()[0] ?? new UndefinedNode(from + 1, to - 1))
  },

  FunctionExp: (fnName, _p1, args, _p2) => {
    const from = fnName.source.startIdx
    const to = _p2.source.endIdx

    return new FnNode(
      from,
      to,
      fnName.sourceString,
      args.children.map((arg) => arg.toAst())
    )
  },

  MethodExp: (_, fnName, _p1, args, _p2) => {
    const from = _.source.startIdx
    const to = _p2.source.endIdx

    return new FnNode(
      from,
      to,
      fnName.sourceString,
      args.children.map((arg) => arg.toAst()),
      true
    )
  },

  Argument: (nameNode, _, exp, __) => {
    const from = nameNode.source.startIdx
    const to = __.source.endIdx
    // I should fix this in the grammar, depending on the rule that matches sometimes the name has ":" at the end sometimes not
    const name = nameNode.sourceString.endsWith(":")
      ? nameNode.sourceString.slice(0, -1)
      : nameNode.sourceString

    const rawValue = exp.toAst()
    const value = isArray(rawValue) ? new UndefinedNode(to, to) : rawValue // empty array means there is no value
    return new ArgumentNode(from, to, name, value)
  },

  IdRef: (_, chars, __) => {
    const from = _.source.startIdx
    const to = __.source.endIdx
    return new IdRefNode(from, to, chars.sourceString)
  },

  nameRef: (name) => {
    const from = name.source.startIdx
    const to = name.source.endIdx
    return new NameRefNode(from, to, name.sourceString)
  },

  StringLiteral: function (_q1, string, _q2) {
    const from = _q1.source.startIdx
    const to = _q2.source.endIdx
    return new StringNode(from, to, string.sourceString)
  },
  numberLiteral: (num) => new NumberNode(num.source.startIdx, num.source.endIdx, num.sourceString),
  MulExp_times: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Multiply",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, undefined, x.toAst()))
    )
  },
  MulExp_divide: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Divide",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, undefined, x.toAst()))
    )
  },
  AddExp_plus: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Plus",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, undefined, x.toAst()))
    )
  },
  AddExp_minus: (a, _, b) => {
    const from = a.source.startIdx
    const to = b.source.endIdx

    return new FnNode(
      from,
      to,
      "Minus",
      [a, b].map((x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, undefined, x.toAst()))
    )
  },

  AccessExp: (obj, _, key) => {
    const from = obj.source.startIdx
    const to = obj.source.endIdx

    return new FnNode(
      from,
      to,
      "Get",
      [obj, key].map(
        (x) => new ArgumentNode(x.source.startIdx, x.source.endIdx, undefined, x.toAst())
      )
    )
  },

  PropertyName: (name) =>
    new StringNode(name.source.startIdx, name.source.endIdx, name.sourceString),

  _iter: (...args) => args.map((arg) => arg.toAst()),
})

export abstract class AstNode {
  abstract readonly from: number
  abstract readonly to: number
  abstract eval(scope: Scope): Promise<any>
  // abstract eval(parentIds: string[], selfId: string): Promise<any>
  abstract getReferencedIds(): string[]
  abstract isConstant(): boolean
}

class UndefinedNode extends AstNode {
  readonly from: number
  readonly to: number

  constructor(from: number, to: number) {
    super()
    this.from = from
    this.to = to
  }

  async eval() {
    return undefined
  }

  getReferencedIds() {
    return []
  }

  isConstant() {
    return true
  }
}

export class FnNode extends AstNode {
  readonly from: number
  to: number
  name: string
  args: ArgumentNode[]
  isMethod: boolean

  constructor(
    from: number,
    to: number,
    fnName: string,
    args: ArgumentNode[],
    isMethod: boolean = false // if true function is evaluated to apply to node where it's called from
  ) {
    super()
    this.from = from
    this.to = to
    this.name = fnName
    this.args = args
    this.isMethod = isMethod
  }

  async eval(scope: Scope) {
    let fn = FUNCTIONS[this.name]["function"]
    if (!fn) {
      return null
    }

    const namedArgs: { [name: string]: any } = {}
    const positionalArgs: any[] = []

    const evaledArgs = await Promise.all(
      this.args.map(async (arg) => [arg.name, await arg.eval(scope)])
    )

    for (const [name, value] of evaledArgs) {
      if (!name) {
        positionalArgs.push(value)
      } else {
        namedArgs[name] = value
      }
    }

    return fn(positionalArgs, namedArgs, scope)
  }

  getReferencedIds(): string[] {
    const idMap: { [id: string]: boolean } = {}

    for (const arg of this.args) {
      for (const id of arg.getReferencedIds()) {
        idMap[id] = true
      }
    }

    return Object.keys(idMap)
  }

  isConstant() {
    return this.args.every((arg) => arg.isConstant())
  }
}

export class BulletNode extends AstNode {
  readonly from: number
  readonly to: number
  readonly key: string | undefined
  readonly value: AstNode[]

  constructor(from: number, to: number, key: string | undefined, value: AstNode[]) {
    super()
    this.key = key
    this.to = to
    this.from = from

    this.value = value
      // remove string values that consist only of spaces
      .filter((astNode) => !(astNode instanceof TextNode && astNode.text.trim() === ""))
  }

  async eval(scope: Scope) {
    return Promise.all(this.value.map((part) => part.eval(scope)))
  }

  isConstant(): boolean {
    return this.value.every((part) => part.isConstant())
  }

  getReferencedIds(): string[] {
    return this.value.flatMap((part) => part.getReferencedIds())
  }
}

export class InlineExprNode extends AstNode {
  constructor(readonly from: number, readonly to: number, readonly expr: AstNode) {
    super()
  }

  async eval(scope: Scope) {
    return this.expr.eval(scope)
  }

  isConstant(): boolean {
    return this.expr.isConstant()
  }

  getReferencedIds(): string[] {
    return this.expr.getReferencedIds()
  }
}

export class ArgumentNode extends AstNode {
  from: number
  to: number
  name: string | undefined
  exp: AstNode

  constructor(from: number, to: number, name: string | undefined, exp: AstNode) {
    super()
    this.from = from
    this.to = to
    this.name = name
    this.exp = exp
  }

  isConstant() {
    return this.exp.isConstant()
  }

  eval(scope: Scope): any {
    return this.exp.eval(scope)
  }

  getReferencedIds(): string[] {
    return this.exp.getReferencedIds()
  }
}

export class IdRefNode extends AstNode {
  constructor(readonly from: number, readonly to: number, readonly id: string) {
    super()
  }

  async eval(scope: Scope) {
    return scope.transcludedScopes[this.id]
  }

  getReferencedIds(): string[] {
    return [this.id]
  }

  isConstant(): boolean {
    return false
  }
}

export class NameRefNode extends AstNode {
  constructor(readonly from: number, readonly to: number, readonly name: string) {
    super()
  }

  async eval(scope: Scope) {
    return scope.lookup(this.name)
  }

  getReferencedIds(): string[] {
    return []
  }

  isConstant(): boolean {
    return false
  }
}

export class StringNode extends AstNode {
  constructor(readonly from: number, readonly to: number, readonly string: string) {
    super()
  }

  async eval() {
    return this.string
  }

  getReferencedIds(): string[] {
    return []
  }

  isConstant(): boolean {
    return true
  }
}

export class TextNode extends AstNode {
  constructor(readonly from: number, readonly to: number, readonly text: string) {
    super()
  }

  async eval() {
    return this.text
  }

  getReferencedIds(): string[] {
    return []
  }

  isConstant(): boolean {
    return true
  }
}

export class NumberNode extends AstNode {
  readonly from: number
  readonly to: number
  readonly number: number

  constructor(from: number, to: number, num: string) {
    super()
    this.from = from
    this.to = to
    this.number = parseFloat(num)
  }

  eval() {
    return promisify(this.number)
  }

  getReferencedIds(): string[] {
    return []
  }

  isConstant(): boolean {
    return true
  }
}

export function isLiteral(node: AstNode) {
  return node instanceof StringNode || node instanceof NumberNode || node instanceof UndefinedNode
}
