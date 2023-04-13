import { parseBullet } from "./index"
import { BulletNode } from "./ast"
import { getNode, Graph, useGraph } from "../graph"
import { useEffect, useState } from "react"

export interface ScopeData {
  $value: any
  [name: string]: ScopeData
}

export class DumbScope {
  parentScope: DumbScope | undefined
  data: ScopeData = {
    $value: undefined,
  } as ScopeData
  childScopes: DumbScope[] = []
  bullet: BulletNode

  private onUpdate: () => void
  private resolve: (x: any) => void = () => {}
  private isDisabled: boolean = false

  constructor(graph: Graph, id: string, parentScope: DumbScope | undefined, onUpdate: () => void) {
    const node = getNode(graph, id)
    this.parentScope = parentScope
    this.onUpdate = onUpdate
    this.bullet = parseBullet(node.value)
    const pendingValue = new Promise((resolve) => {
      this.resolve = resolve
    })

    this.data.$value = pendingValue

    if (this.bullet.key && parentScope && !parentScope.data[this.bullet.key]) {
      parentScope.data[this.bullet.key] = this.data
    }

    for (const childId of node.children) {
      this.childScopes.push(new DumbScope(graph, childId, this, onUpdate))
    }
  }

  private _lookup(name: string): any {
    if (this.data[name]) {
      return this.data[name]
    }

    return this.parentScope?.lookup(name)
  }

  lookup(name: string): any {
    return this.parentScope?._lookup(name)
  }

  get(name: string) {
    return this.data[name]
  }

  eval() {
    this.bullet.eval(this).then((value) => {
      this.resolve(value[0])
      this.data.$value = value[0]

      if (!this.isDisabled) {
        this.onUpdate()
      }
    })

    for (const childScope of this.childScopes) {
      childScope.eval()
    }
  }

  disable() {
    this.isDisabled = true

    for (const childScope of this.childScopes) {
      childScope.disable()
    }
  }
}

export function getValue(obj: any) {
  if (obj && obj.$value) {
    return obj.$value
  }

  return obj
}

export function getValueSync(obj: any) {
  const value = getValue(obj)

  if (value instanceof Promise) return undefined
  return value
}

export function useRootScope(rootId: string): [DumbScope | undefined, number] {
  const { graph } = useGraph()
  const [scope, setScope] = useState<DumbScope | undefined>()
  const [scopeIterationCount, setScopeIterationCount] = useState(0)

  useEffect(() => {
    if (!graph) {
      return
    }

    if (scope) {
      scope.disable()
    }

    const newScope = new DumbScope(graph, rootId, undefined, () => {
      setScope(newScope)
      setScopeIterationCount((i) => i + 1)
    })

    newScope.eval()

    setScope(newScope)
    setScopeIterationCount(1)
  }, [graph, rootId])

  return [scope, scopeIterationCount]
}
