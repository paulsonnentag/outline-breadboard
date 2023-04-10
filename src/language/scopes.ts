import { getNode, Graph, ValueNode } from "../graph"
import { parseProperty } from "./index"
import { AstNode } from "./ast"
import { autorun, observable, runInAction, toJS } from "mobx"
import { useEffect, useState } from "react"

// @ts-ignore
window.$toJS = toJS

export interface Scope {
  id: string
  key?: string
  value: any
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
    await updateScopeOfNode(graph, node.id)
  }
}

export async function updateScopeOfNode(graph: Graph, nodeId: string) {
  const node = getNode(graph, nodeId)
  const property = parseProperty(node.value)

  if (!property) {
    scopesMobx.set(node.id, {
      id: nodeId,
      value: undefined,
      props: {},
    })
  }

  let value = property
    ? property.isConstant()
      ? await property.eval([], "") // doesn't matter what we pass in here because expression doesn't reference other values
      : property.exp
    : undefined

  const props: { [name: string]: string } = {}

  for (const childId of node.children) {
    const childProperty = parseProperty((graph[childId] as ValueNode).value) // todo: remove as ValueNode once we've removed refNodes

    if (childProperty && childProperty.name) {
      props[childProperty.name] = childId
    }
  }

  runInAction(() => {
    scopesMobx.set(node.id, {
      id: nodeId,
      value,
      key: property?.name,
      props,
    })
  })
}

export async function getValueOfNode(parentNodeIds: string[], nodeId: string): Promise<any> {
  const scope = scopesMobx.get(nodeId)
  const value = scope?.value
  const result = value instanceof AstNode ? await value.eval(parentNodeIds, nodeId) : value
  return result
}

export async function getPropertyOfNode(
  parentNodeIds: string[],
  nodeId: string,
  key: string
): Promise<any> {
  const scope = scopesMobx.get(nodeId)

  return getValueOfNode(parentNodeIds, scope!.props[key])
}

export async function lookupName(parentNodeIds: string[], name: string): Promise<any> {
  for (let i = 0; i < parentNodeIds.length; i++) {
    const parentId = parentNodeIds[i]
    const parentScope = scopesMobx.get(parentId)
    const referencedId = parentScope!.props[name]

    if (referencedId) {
      const parentIdsOfCurrentParent = parentNodeIds.slice(0, -i)
      return getValueOfNode(parentIdsOfCurrentParent, referencedId)
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
