import { getNode, Graph } from "../graph"
import { grammar } from "./grammar"
import { ArgumentNode, AstNode, BulletNode, FnNode, formulaSemantics, TextNode } from "./ast"

interface Bullet {
  key?: string // todo: implement key
  value: any[]
}

export async function evalBullet(graph: Graph, nodeId: string): Promise<Bullet | null> {
  const node = getNode(graph, nodeId)
  const match = grammar.match(node.value)

  if (!match.succeeded()) {
    return null
  }

  const astNodes = formulaSemantics(match).toAst()

  return {
    value: await Promise.all(astNodes.map((expr: AstNode) => expr.eval(graph, nodeId))),
  } as Bullet
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

export function evalInlineExp(graph: Graph, source: string): Promise<any> {
  const match = grammar.match(source, "InlineExp")

  if (!match.succeeded()) {
    return Promise.reject("")
  }

  try {
    return formulaSemantics(match).toAst().eval(graph)
  } catch (err: any) {
    console.error(err.message)
    return Promise.reject(err.message)
  }
}

export function parseInlineExp(source: string): AstNode | undefined {
  const match = grammar.match(source, "InlineExp")

  if (!match.succeeded()) {
    return undefined
  }

  return formulaSemantics(match).toAst()
}

export function parseBullet(source: string): BulletNode {
  const match = grammar.match(source, "Bullet")

  if (!match.succeeded()) {
    const from = 0
    const to = source.length
    return new BulletNode(from, to, undefined, [new TextNode(from, to, source)])
  }

  return formulaSemantics(match).toAst()
}

export function iterateOverArgumentNodes(node: AstNode, fn: (arg: ArgumentNode) => void) {
  if (node instanceof FnNode) {
    for (const arg of node.args) {
      iterateOverArgumentNodes(arg, fn)
    }
  }

  if (node instanceof ArgumentNode) {
    fn(node)
    iterateOverArgumentNodes(node.exp, fn)
  }
}
