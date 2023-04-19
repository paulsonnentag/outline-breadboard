import { parseBullet } from "./index"
import { BulletNode } from "./ast"
import { getNode, Graph, useGraph } from "../graph"
import { useEffect, useState } from "react"
import { useStaticCallback } from "../hooks"

export interface ComputationResult {
  name: string
  data: any
}

export class Scope {
  id: string
  parentScope: Scope | undefined
  value: any
  props: {
    [name: string]: Scope
  } = {}

  computationResults: ComputationResult[] = []

  private updateHandlers: ((scope: Scope) => void)[] = []

  childScopes: Scope[] = []
  transcludedScopes: { [id: string]: Scope } = {}
  bullet: BulletNode

  private resolve: (x: any) => void = () => {}
  private isDisabled: boolean = false

  constructor(graph: Graph, id: string, parentScope: Scope | undefined) {
    this.id = id
    const node = getNode(graph, id)
    this.parentScope = parentScope
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
      this.childScopes.push(new Scope(graph, childId, this))
    }

    // create scopes for transcluded nodes
    for (const referencedId of this.bullet.getReferencedIds()) {
      this.transcludedScopes[referencedId] = new Scope(graph, referencedId, this)
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
    for (const childScope of this.childScopes) {
      childScope._extractDataInScope(extractFn, results)
    }

    for (const transcludedScope of Object.values(this.transcludedScopes)) {
      transcludedScope._extractDataInScope(extractFn, results)
    }
  }

  extractDataInScope<T>(extractFn: (scope: Scope) => T | undefined): DataWithProvenance2<T>[] {
    const results: DataWithProvenance2<T>[] = []

    this.traverseScope((scope) => {
      const data = extractFn(scope)
      if (data !== undefined) {
        results.push({ scope, data })
      }
    }, null)

    return results
  }

  traverseScope<T>(fn: (scope: Scope, context: T) => T, context: T, options?: TraverseOptions) {
    const skipTranscludedScopes = options?.skipTranscludedScopes ?? false
    const newContext = fn(this, context)

    for (const childScope of this.childScopes) {
      childScope.traverseScope(fn, newContext, options)
    }

    if (!skipTranscludedScopes) {
      for (const transcludedScope of Object.values(this.transcludedScopes)) {
        transcludedScope.traverseScope(fn, newContext, options)
      }
    }
  }

  async traverseScopeAsync<T>(
    fn: (scope: Scope, context: T) => Promise<T>,
    context: T,
    options?: TraverseOptions
  ): Promise<any> {
    const skipTranscludedScopes = options?.skipTranscludedScopes ?? false
    const childContext = await fn(this, context)

    for (const childScope of this.childScopes) {
      await childScope.traverseScopeAsync(fn, childContext, options)
    }

    if (!skipTranscludedScopes) {
      for (const transcludedScope of Object.values(this.transcludedScopes)) {
        await transcludedScope.traverseScopeAsync(fn, childContext, options)
      }
    }
  }

  addComputationResult(computation: ComputationResult) {
    this.computationResults.push(computation)
    this.onUpdate()
  }

  // todo: on update doesn't cover all cases
  private onUpdate() {
    for (const updateHandler of this.updateHandlers) {
      updateHandler(this)
    }

    this.parentScope?.onUpdate()
  }

  registerUpdateHandler(handler: (scope: Scope) => void) {
    if (this.updateHandlers.includes(handler)) {
      return
    }

    this.updateHandlers.push(handler)
  }
}

interface TraverseOptions {
  skipTranscludedScopes: boolean
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

export function useRootScope(rootId: string): Scope | undefined {
  const { graph } = useGraph()
  const [scope, setScope] = useState<Scope | undefined>()

  useEffect(() => {
    if (!graph) {
      return
    }

    if (scope) {
      scope.disable()
    }

    const newScope = new Scope(graph, rootId, undefined)

    newScope.registerUpdateHandler(() => setScope(newScope))
    newScope.eval()
    setScope(newScope)
  }, [graph, rootId])

  return scope
}

export interface DataWithProvenance2<T> {
  scope: Scope
  data: T
}

export function useUpdateHandler(scope: Scope, handler: (scope: Scope) => void) {
  const staticHandler = useStaticCallback(handler)
  scope.registerUpdateHandler(staticHandler)
}
