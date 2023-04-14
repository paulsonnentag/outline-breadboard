import { parseBullet } from "./index"
import { AstNode, BulletNode, IdRefNode } from "./ast"
import { getNode, Graph, useGraph } from "../graph"
import { useEffect, useState } from "react"
import { DataWithProvenance, extractDataInNodeAndBelow } from "../properties"

export class DumbScope {
  id: string
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
    this.id = id
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

  lookup(name: string): DumbScope {
    return this.parentScope?._lookup(name)
  }

  lookupValue(name: string): any {
    return getValueSync(this.lookup(name))
  }

  get(name: string) {
    return this.props[name]
  }

  getValue(name: string): any {
    return getValueSync(this.get(name))
  }

  valueOf(): any {
    return getValueSync(this.value[0])
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

  // this is used in the autocompletion to avoid that circular references are inserted
  isInScope(id: string): boolean {
    if (this.id === id) {
      return true
    }

    return this.parentScope ? this.parentScope.isInScope(id) : false
  }

  private _extractDataInScope<T>(
    extractFn: (scope: DumbScope) => T | undefined,
    results: DataWithProvenance2<T>[]
  ) {
    const data = extractFn(this)

    if (data !== undefined) {
      results.push({ scope: this, data })
    }

    for (const childScope of this.childScopes) {
      childScope._extractDataInScope(extractFn, results)
    }

    for (const transcludedScope of Object.values(this.transcludedScopes)) {
      transcludedScope._extractDataInScope(extractFn, results)
    }
  }

  extractDataInScope<T>(extractFn: (scope: DumbScope) => T | undefined): DataWithProvenance2<T>[] {
    const results: DataWithProvenance2<T>[] = []

    this._extractDataInScope(extractFn, results)

    return results
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

export interface DataWithProvenance2<T> {
  scope: DumbScope
  data: T
}
