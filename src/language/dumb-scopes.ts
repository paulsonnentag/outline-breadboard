import { parseBullet } from "./index"
import { AstNode, BulletNode, IdRefNode } from "./ast"
import { getNode, Graph, useGraph } from "../graph"
import { useEffect, useState } from "react"

export class DumbScope {
  parentScope: DumbScope | undefined
  value: any
  props: {
    [name: string]: DumbScope
  } = {}
  childScopes: DumbScope[] = []
  transcludedScopes: { [id: string]: DumbScope } = {}
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

    this.value = pendingValue

    if (this.bullet.key && parentScope && !parentScope.props[this.bullet.key]) {
      parentScope.props[this.bullet.key] = this
    }

    // create scopes for child nodes
    for (const childId of node.children) {
      this.childScopes.push(new DumbScope(graph, childId, this, onUpdate))
    }

    // create scopes for transcluded nodes
    for (const referencedId of this.bullet.getReferencedIds()) {
      this.transcludedScopes[referencedId] = new DumbScope(graph, referencedId, this, onUpdate)
    }
  }

  private _lookup(name: string): any {
    if (this.props[name]) {
      return this.props[name]
    }

    return this.parentScope?._lookup(name)
  }

  lookup(name: string): any {
    return this.parentScope?._lookup(name)
  }

  get(name: string) {
    return this.props[name]
  }

  eval() {
    this.bullet.eval(this).then((value) => {
      this.resolve(value)
      this.value = value

      if (!this.isDisabled) {
        this.onUpdate()
      }
    })

    for (const childScope of this.childScopes) {
      childScope.eval()
    }

    for (const transcludedScope of Object.values(this.transcludedScopes)) {
      transcludedScope.eval()
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
  if (obj instanceof DumbScope) {
    return obj.value[0]
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
