import { Graph, ValueNode } from "../graph"
import { parseProperty } from "./index"
import { AstNode } from "./ast"

export interface Scopes {
  [id: string]: {
    key?: string
    value: any
    props: {
      [name: string]: string
    }
  }
}

export async function initScopes(graph: Graph): Promise<Scopes> {
  const valueNodes: ValueNode[] = Object.values(graph).filter(
    (node) => node.type === "value"
  ) as ValueNode[]

  const valueGraph: Scopes = {}

  for (const node of valueNodes) {
    const property = parseProperty(node.value)

    if (!property) {
      valueGraph[node.id] = {
        value: undefined,
        props: {},
      }
    }

    let value = property
      ? property.isConstant()
        ? await property.eval({}, [], "") // doesn't matter what we pass in here because expression doesn't reference other values
        : property.exp
      : undefined

    const props: { [name: string]: string } = {}

    for (const childId of node.children) {
      const childProperty = parseProperty((graph[childId] as ValueNode).value) // todo: remove as ValueNode once we've removed refNodes

      if (childProperty && childProperty.name) {
        props[childProperty.name] = childId
      }
    }

    valueGraph[node.id] = {
      value,
      key: property?.name,
      props: {},
    }
  }

  return valueGraph
}

export async function getValueOfNode(
  scopes: Scopes,
  parentNodeIds: string[],
  nodeId: string
): Promise<any> {
  const value = scopes[nodeId].value

  return value instanceof AstNode ? value.eval(scopes, parentNodeIds, nodeId) : value
}

export async function lookupName(
  scopes: Scopes,
  parentNodeIds: string[],
  name: string
): Promise<any> {
  for (let i = 0; i < parentNodeIds.length; i++) {
    const parentId = parentNodeIds[i]
    const parentScope = scopes[parentId]

    const referencedId = parentScope.props[name]

    if (referencedId) {
      const parentIdsOfCurrentParent = parentNodeIds.slice(0, -i)
      return getValueOfNode(scopes, parentIdsOfCurrentParent, referencedId)
    }
  }
}
