import { parseBullet } from "./index"
import { BulletNode } from "./ast"
import { createValueNode, getGraphDocHandle, getNode, Graph, useGraph } from "../graph"
import { useEffect, useState } from "react"
import { useStaticCallback } from "../hooks"
import LatLngLiteral = google.maps.LatLngLiteral
import { parseDate, parseLatLng } from "../properties"

export interface ComputationResult {
  name: string
  data: any
}

export class Scope {
  id: string
  parentScope: Scope | undefined
  value: any
  source: string

  props: {
    [name: string]: Scope
  } = {}

  computationResults: ComputationResult[] = []

  readonly expandedResultsByIndex: { [index: number]: boolean }

  private updateHandlers: ((scope: Scope) => void)[] = []

  childScopes: Scope[] = []
  transcludedScopes: { [id: string]: Scope } = {}
  bullet: BulletNode

  private resolve: (x: any) => void = () => {}
  private isDisabled: boolean = false

  constructor(graph: Graph, id: string, parentScope: Scope | undefined) {
    this.id = id
    this.parentScope = parentScope
    const node = getNode(graph, id)
    this.expandedResultsByIndex = node.expandedResultsByIndex
    this.source = node.value
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

  // returns a list of all properties that are either defined on the node itself or in transcluded nodes
  async getOwnPropertyAndPropertiesOfTransclusionAsync<T>(
    key: string,
    parse: (value: string) => T | undefined
  ): Promise<DataWithProvenance<T>[]> {
    const ownProperty = parse(await this.getPropertyAsync(key))
    const transcludedProperties: DataWithProvenance<T>[] = (
      await Promise.all(
        Object.values(this.transcludedScopes).map(async (transcludedScope) => ({
          scope: transcludedScope,
          data: parse(await transcludedScope.getPropertyAsync(key)),
        }))
      )
    ).filter(({ data }) => data !== undefined) as DataWithProvenance<T>[]

    return ownProperty
      ? transcludedProperties.concat({ data: ownProperty, scope: this })
      : transcludedProperties
  }

  getOwnPropertyAndPropertiesOfTransclusion<T>(
    key: string,
    parse: (value: string) => T | undefined
  ): DataWithProvenance<T>[] {
    const ownProperty = parse(this.getProperty(key))
    const transcludedProperties: DataWithProvenance<T>[] = Object.values(this.transcludedScopes)
      .map((transcludedScope) => ({
        scope: transcludedScope,
        data: parse(transcludedScope.getProperty(key)),
      }))
      .filter(({ data }) => data !== undefined) as DataWithProvenance<T>[]

    return ownProperty
      ? transcludedProperties.concat({ data: ownProperty, scope: this })
      : transcludedProperties
  }

  readAsDate(): DataWithProvenance<Date>[] {
    if (this.value instanceof Promise) {
      return []
    }

    return this.value.flatMap((part: any) => {
      if (!(part instanceof Scope)) {
        return []
      }

      const date = parseDate(part.id)
      return date ? [{ scope: part, data: date }] : []
    })
  }

  readAsLocation(): DataWithProvenance<LatLngLiteral>[] {
    if (this.value instanceof Promise) {
      return []
    }

    return this.value.flatMap((part: any) => {
      if (!(part instanceof Scope)) {
        return []
      }

      const latLng = parseLatLng(part.getProperty("position"))
      return latLng ? [{ scope: part, data: latLng }] : []
    })
  }

  extractDataInScope<T>(
    extractFn: (scope: Scope) => T | T[] | undefined,
    options?: TraverseOptions
  ): DataWithProvenance<T>[] {
    const results: DataWithProvenance<T>[] = []

    this.traverseScope(
      (scope) => {
        const data = extractFn(scope)

        if (Array.isArray(data)) {
          for (const item of data) {
            results.push({ scope, data: item })
          }
        } else if (data !== undefined) {
          results.push({ scope, data })
        }
      },
      null,
      options
    )

    return results
  }

  async extractDataInScopeAsync<T>(
    extractFn: (scope: Scope) => Promise<T | T[] | undefined>,
    options?: TraverseOptions
  ): Promise<DataWithProvenance<T>[]> {
    const results: DataWithProvenance<T>[] = []

    await this.traverseScopeAsync(
      async (scope) => {
        const data = await extractFn(scope)

        if (Array.isArray(data)) {
          for (const item of data) {
            results.push({ scope, data: item })
          }
        } else if (data !== undefined) {
          results.push({ scope, data })
        }
      },
      null,
      options
    )

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

  setProperty(name: string, value: string) {
    const graphDocHandle = getGraphDocHandle()
    const propertyScope = this.getChildScope(name)

    // property already exists => override value
    if (propertyScope) {
      const keyValue = `${name}: ${value}`

      // skip if value already matches
      if (propertyScope.source === keyValue) {
        return
      }

      graphDocHandle.change(({ graph }) => {
        if (propertyScope) {
          const node = getNode(graph, propertyScope.id)
          node.value = keyValue
        }
      })
      return
    }

    // otherwise create new node
    graphDocHandle.change(({ graph }) => {
      // otherwise create new property
      const parentNode = getNode(graph, this.id)
      const childNode = createValueNode(graph, { key: name, value })

      parentNode.children.push(childNode.id)
    })
  }

  insertChildNode(value: string) {
    const graphDocHandle = getGraphDocHandle()

    // otherwise create new node
    graphDocHandle.change(({ graph }) => {
      // otherwise create new property
      const parentNode = getNode(graph, this.id)
      const childNode = createValueNode(graph, { value })
      parentNode.children.unshift(childNode.id)
    })
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

  isPrecedingSiblingOf(scope: Scope): boolean {
    if (
      this === scope ||
      !this.parentScope ||
      !scope.parentScope ||
      scope.parentScope !== this.parentScope
    ) {
      return false
    }

    const ownIndex = this.parentScope.childScopes.indexOf(this)
    const otherScopeIndex = this.parentScope.childScopes.indexOf(scope)

    return ownIndex < otherScopeIndex
  }

  // todo: do something better than just return the source, it's fine for nodes without formulas
  async getLabelAsync() {
    return this.source
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

interface UseRootScopeOptions {
  disableEval: boolean
}

export function useRootScope(rootId: string, options?: UseRootScopeOptions): Scope | undefined {
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

    if (!options || !options.disableEval) {
      newScope.eval()
    }
    setScope(newScope)
  }, [graph, rootId])

  return scope
}

export interface DataWithProvenance<T> {
  scope: Scope
  data: T
}

export function useUpdateHandler(scope: Scope, handler: (scope: Scope) => void) {
  const staticHandler = useStaticCallback(handler)
  scope.registerUpdateHandler(staticHandler)
}
