import { parseBullet } from "./index"
import { BulletNode } from "./ast"
import { getNode, Graph, useGraph } from "../graph"
import { useEffect, useState } from "react"

export class Scope {
  id: string
  parentScope: Scope | undefined
  value: any
  props: {
    [name: string]: Scope
  } = {}
  childScopes: Scope[] = []
  transcludedScopes: { [id: string]: Scope } = {}
  bullet: BulletNode

  private onUpdate: () => void
  private resolve: (x: any) => void = () => {}
  private isDisabled: boolean = false

  constructor(graph: Graph, id: string, parentScope: Scope | undefined, onUpdate: () => void) {
    this.id = id
    const node = getNode(graph, id)
    this.parentScope = parentScope
    this.onUpdate = onUpdate
    this.bullet = parseBullet(node.value)

    const pendingValue = new Promise((resolve) => {
      this.resolve = resolve
    })

    this.value = pendingValue

    if (this.bullet.key && parentScope && !parentScope.props[this.bullet.key.string]) {
      parentScope.props[this.bullet.key.string] = this
    }

    // create scopes for child nodes
    for (const childId of node.children) {
      this.childScopes.push(new Scope(graph, childId, this, onUpdate))
    }

    // create scopes for transcluded nodes
    for (const referencedId of this.bullet.getReferencedIds()) {
      this.transcludedScopes[referencedId] = new Scope(graph, referencedId, this, onUpdate)
    }
  }

  private _lookup(name: string): Scope | undefined {
    if (this.props[name]) {
      return this.props[name]
    }

    return this.parentScope?._lookup(name)
  }

  // return closest node with matching name in ancestor nodes
  lookup(name: string): Scope | undefined {
    return this.parentScope?._lookup(name)
  }

  // if value is not resolved yet undefined is returned
  lookupValue(name: string): any {
    return this.lookup(name)?.valueOf()
  }

  // returns first child node that has a matching name
  getChildScope(name: string): Scope | undefined {
    return this.props[name]
  }

  // if value is not resolved yet undefined is returned
  getProperty(name: string, index: number = 0): any {
    return this.getChildScope(name)?.valueOf(index)
  }

  async getPropertyAsync(name: string): Promise<any> {
    return this.getChildScope(name)?.valueOfAsync()
  }

  // will only contain resolved properties
  getAllProperties(): { [name: string]: any } {
    const props: { [name: string]: any } = {}

    for (const [name, scope] of Object.entries(this.props)) {
      const value = scope.valueOf()

      if (value !== undefined) {
        props[name] = value
      }
    }

    return props
  }

  // if value is not resolved yet undefined is returned
  valueOf(index: number = 0) {
    return this.value instanceof Promise ? undefined : this.value[index]
  }

  async valueOfAsync(index: number = 0): Promise<any> {
    return (await this.value)[index]
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

  // returns true if id matches current scope or if id matches an ancestor of this scope
  isInScope(id: string): boolean {
    if (this.id === id) {
      return true
    }

    return this.parentScope ? this.parentScope.isInScope(id) : false
  }

  private _extractDataInScope<T>(
    extractFn: (scope: Scope) => T | undefined,
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

  extractDataInScope<T>(extractFn: (scope: Scope) => T | undefined): DataWithProvenance2<T>[] {
    const results: DataWithProvenance2<T>[] = []

    this._extractDataInScope(extractFn, results)

    return results
  }
}

// if value is not resolved yet undefined is returned
export function valueOf(obj: any) {
  if (obj instanceof Scope) {
    return obj.value()
  }

  return obj
}

export async function valueOfAsync(obj: any) {
  if (obj instanceof Scope) {
    return await obj.value()
  }

  return obj
}

export function useRootScope(rootId: string): [Scope | undefined, number] {
  const { graph } = useGraph()
  const [scope, setScope] = useState<Scope | undefined>()
  const [scopeIterationCount, setScopeIterationCount] = useState(0)

  useEffect(() => {
    if (!graph) {
      return
    }

    if (scope) {
      scope.disable()
    }

    const newScope = new Scope(graph, rootId, undefined, () => {
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
  scope: Scope
  data: T
}
