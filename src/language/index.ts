import { getNode, Graph } from "../graph"
import { grammar } from "./grammar"
import {
  AstNode,
  BulletNode,
  formulaSemantics,
  InlineExprNode,
  StringNode,
  UndefinedNode,
} from "./ast"

interface Bullet {
  key?: string // todo: implement key
  value: any[]
}

export function getReferencedNodeIds(source: string): string[] {
  const match = grammar.match(source)

  if (!match.succeeded()) {
    return []
  }

  const idMap: { [id: string]: boolean } = {}

  const parts = formulaSemantics(match).toAst()

  for (const part of parts) {
    for (const id of part.getIdRefs()) {
      idMap[id] = true
    }
  }

  return Object.keys(idMap)
}

export function parseExpression(source: string): AstNode {
  const match = grammar.match(source, "Exp")
  if (!match.succeeded()) {
    const from = 0
    const to = source.length
    return new UndefinedNode(from, to)
  }

  const result = formulaSemantics(match).toAst()
  return result
}

// using regexes here instead of ohm to be more forgiving
// if there are syntax errors in an individual embedded expressions we still want to parse out the rest of the bullet
export function parseBullet(source: string): BulletNode {
  const key = parseKey(source)
  const bulletValue = []

  const EXPRESSION_REGEX = /\{([^}]*?)}/g
  let match,
    prevIndex = key ? key.to : 0
  while ((match = EXPRESSION_REGEX.exec(source)) != null) {
    const [inlineExpr, exprSource] = match
    const from = match.index
    const to = from + inlineExpr.length

    if (from > prevIndex) {
      const text = source.slice(prevIndex, from)
      // ignore leading space
      if (bulletValue.length !== 0 || text.trim() !== "") {
        bulletValue.push(new StringNode(prevIndex, from, text))
      }
    }

    prevIndex = to

    const expression = parseExpression(exprSource)
    expression.applyOffset(from)
    bulletValue.push(new InlineExprNode(from, to, expression))
  }

  if (prevIndex < source.length) {
    const text = source.slice(prevIndex, source.length)
    bulletValue.push(new StringNode(prevIndex, source.length, text))
  }

  return new BulletNode(0, source.length, key, bulletValue)
}

export const KEYWORD_REGEX = /(^.*?):/
function parseKey(source: string): StringNode | undefined {
  const match = source.match(KEYWORD_REGEX)
  if (match) {
    const key = match[1]
    return new StringNode(0, key.length + 1, key)
  }

  return undefined
}
