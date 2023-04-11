import { getNode, Graph, ValueNode } from "../graph"
import { parseBullet } from "./index"
import { AstNode, TextNode } from "./ast"
import { autorun, observable, runInAction, toJS } from "mobx"
import { useEffect, useState } from "react"

// @ts-ignore
window.$toJS = toJS

export interface Scope {
  id: string
  key?: string
  value: AstNode[]
  props: {
    [name: string]: string
  }
}

export interface Scopes {
  [id: string]: Scope
}

export const scopesMobx = observable.map<string, Scope>({})

export async function initScopes(graph: Graph) {
  const valueNodes: ValueNode[] = Object.values(graph).filter(
    (node) => node.type === "value"
  ) as ValueNode[]

  scopesMobx.replace({})

  for (const node of valueNodes) {
    updateScopeOfNode(graph, node.id)
  }
}

export function updateScopeOfNode(graph: Graph, nodeId: string) {
  const node = getNode(graph, nodeId)
  const bullet = parseBullet(node.value)

  const props: { [name: string]: string } = {}

  for (const childId of node.children) {
    updateScopeOfNode(graph, childId)

    const childScope = scopesMobx.get(childId) as Scope

    if (childScope.key) {
      props[childScope.key] = childId
    } else if (childScope.value.length === 1) {
      const value = childScope.value[0]
      if (value instanceof TextNode) {
        props[value.text] = childId
      }
    }
  }

  runInAction(() => {
    const scope = {
      id: nodeId,
      value: bullet.value,
      key: bullet.key,
      props,
    }
    scopesMobx.set(nodeId, scope)
  })
}

export async function getValueOfNode(parentNodeIds: string[], nodeId: string): Promise<any[]> {
  const scope = scopesMobx.get(nodeId)

  return Promise.all(scope!.value.map((part) => part.eval(parentNodeIds, nodeId)))
}

// todo: currently we don't handle values that consist of multiple parts, in that case we just return undefined
export async function getSingleValueOfNode(parentNodeIds: string[], nodeId: string): Promise<any> {
  const value = await getValueOfNode(parentNodeIds, nodeId)
  return value.length === 1 ? value[0] : undefined
}

export async function getPropertyOfNode(
  parentNodeIds: string[],
  nodeId: string,
  key: string
): Promise<any> {
  const scope = scopesMobx.get(nodeId)
  return getSingleValueOfNode(parentNodeIds, scope!.props[key])
}

export async function lookupName(parentNodeIds: string[], name: string): Promise<any> {
  for (let i = 0; i < parentNodeIds.length; i++) {
    const parentId = parentNodeIds[i]
    const parentScope = scopesMobx.get(parentId)
    const referencedNodeId = parentScope!.props[name]

    if (referencedNodeId) {
      const referencedNode = scopesMobx.get(referencedNodeId) as Scope
      const parentIdsOfReferencedNode = parentNodeIds.slice(0, -i)

      let value

      try {
        value = await getSingleValueOfNode(parentIdsOfReferencedNode, referencedNodeId)
      } catch (err) {
        console.error(err)
      }

      // special case return node itself instead of it's value
      if (
        (value === name && referencedNode.key === undefined) || /// node has no key and value is text equal to key
        (referencedNode.value.length === 0 && referencedNode.key !== undefined) // node has key but no value
      ) {
        return referencedNode
      }

      return value
    }
  }
}

export function useValueOfNode(parentNodeIds: string[], nodeId: string) {
  const [value, setValue] = useState()

  useEffect(() => {
    const dispose = autorun(() => {
      getValueOfNode(parentNodeIds, nodeId).then(async (value) => setValue(await value))
    })

    return () => {
      dispose()
    }
  }, parentNodeIds.concat(nodeId))

  return value
}
