import { Graph, ValueNode } from "./graph"
import { parseProperty } from "./language"

interface ValueGraph {
  [id: string]: {
    key?: string
    value: any
    props: {
      [name: string]: string
    }
  }
}

export async function initValueGraph(graph: Graph): Promise<ValueGraph> {
  const valueNodes: ValueNode[] = Object.values(graph).filter(
    (node) => node.type === "value"
  ) as ValueNode[]

  const valueGraph: ValueGraph = {}

  for (const node of valueNodes) {
    const property = parseProperty(node.value)

    if (!property) {
      valueGraph[node.id] = {
        value: undefined,
        props: {},
      }
    }

    console.log(property)

    let value = property
      ? property.isConstant()
        ? await property.eval({}, "")
        : property.exp
      : undefined

    valueGraph[node.id] = {
      value,
      key: property?.name,
      props: {},
    }
  }

  return valueGraph
}
