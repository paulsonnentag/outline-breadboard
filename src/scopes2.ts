import { AstNode } from "./language/ast"
import {
  autorun,
  computed,
  makeObservable,
  observable,
  ObservableMap,
  reaction,
  runInAction,
  trace,
} from "mobx"
import { parseBullet } from "./language"

interface Node {
  id: string
  source: string
  childIds: string[]
}

const graph = observable.map<string, Node>({
  root: {
    id: "root",
    source: "people",
    childIds: ["bob", "subNode", "computed"],
  },

  bob: {
    id: "bob",
    source: "bob:",
    childIds: ["bobAge", "bobNextAge"],
  },

  bobNextAge: {
    id: "bobNextAge",
    source: "nextAge: {age + 1}",
    childIds: [],
  },

  bobAge: {
    id: "bobAge",
    source: "age: 10",
    childIds: [],
  },

  subNode: {
    id: "subNode",
    source: "subNode:",
    childIds: [],
  },

  computed: {
    id: "computed",
    source: "computed: {bob.age + 1}",
    childIds: [],
  },
})

const scopesMobx = observable.map<string, Scope2>({})

export class Scope2 {
  readonly nodeId: string
  readonly parentScope: Scope2 | undefined
  private name: string | undefined
  private value: any[] | undefined
  expressions: AstNode[] = []
  childScopes: Scope2[] = []
  props: ObservableMap<string, Scope2>

  private get source() {
    return graph.get(this.nodeId)!.source
  }

  private get childIds() {
    return graph.get(this.nodeId)!.childIds
  }

  constructor(nodeId: string, parentScope?: Scope2) {
    this.nodeId = nodeId
    this.parentScope = parentScope
    this.props = observable.map<string, Scope2>({}, { name: `${nodeId}.props` })

    makeObservable<Scope2, "name" | "value" | "source" | "childIds">(
      this,
      {
        source: computed,
        childIds: computed,
        name: observable,
        value: observable,
        expressions: observable,
        childScopes: observable,
        props: observable,
        parentScope: observable,
      },
      { name: nodeId }
    )

    reaction(
      () => this.source,
      (source) => {
        const bullet = parseBullet(source)
        this.name = bullet.key
        this.expressions = bullet.value
      },
      { fireImmediately: true }
    )

    autorun(() => {
      if (!this.expressions) {
        return
      }

      Promise.all(this.expressions.map((expr) => expr.eval(this))).then((value) => {
        runInAction(() => {
          console.log("change", nodeId, value)

          this.value = value
        })
      })
    })

    autorun(() => {
      const childScopes = []

      this.props.replace({})

      for (const childId of this.childIds) {
        const childScope = getScope(childId, this)

        childScopes.push(childScope)

        if (childScope.name) {
          this.props.set(childScope.name, observable(childScope))
        }
      }

      this.childScopes = childScopes
    })
  }

  getValue(): any {
    if (!this.value) {
      return undefined
    }

    // todo: do something smarter with values that consist of multiple parts
    if (this.value.length > 1) {
      return undefined
    }

    return this.value[0]
  }

  getName(): string | undefined {
    return this.name
  }

  getChildScope(name: string): Scope2 | undefined {
    const childScope = this.props.get(name)
    if (!childScope) {
      return undefined
    }

    return childScope
  }

  getProperty(name: string): any {
    return this.getChildScope(name)?.getValue()
  }

  private _lookupName(name: string): Scope2 | undefined {
    const childScope = this.props.get(name)

    if (childScope) {
      return childScope
    }

    return this.parentScope?.lookupName(name)
  }

  lookupName(name: string): Scope2 | undefined {
    return this.parentScope?._lookupName(name) //?.getValue()
  }
}

function getScope(id: string, parentScope?: Scope2): Scope2 {
  const scopeId = parentScope ? `${parentScope.nodeId}_${id}` : `_${id}`

  let scope = scopesMobx.get(scopeId)

  if (scope) {
    return scope
  }

  scope = new Scope2(id, parentScope)
  scopesMobx.set(scopeId, scope)

  return scope
}

// scenario computed

/*
const rootScope = getScope("root")

autorun(() => {
  const bobScope = rootScope.getChildScope("bob")?.getProperty("nextAge")

  console.log("age", bobScope)

  // console.log("nextAge", bobScope?.getProperty("nextAge"))
})




setTimeout(() => {
  console.log("update")
  runInAction(() => {
    graph.get("bobAge")!.source = "age: 100"
  })
}, 100)

 */

// scenario deeply computed

/*
const rootScope = getScope("root")

autorun(() => {
  const computedScope = rootScope.getChildScope("computed")

  console.log("computed", computedScope?.getValue())
})

setTimeout(() => {
  runInAction(() => {
    graph.get("bobAge")!.source = "age: 100"
  })
})

 */

// scenario deep

/*
const rootScope = getScope("root")
const subScope = rootScope.getChildScope("subNode")

autorun(() => {
  const scope = subScope?.lookupName("bob")?.getProperty("age")

  console.log("bob", scope)
})

setTimeout(() => {
  graph.get("bobAge")!.source = "age: 100"
}, 100)


 */
// Scenario basic

/*

const ageScope = getScope("bobAge")

autorun(() => {
  console.log("bobAge", ageScope.getValue())
})

graph.get("bobAge")!.source = "age: 100"

const bobScope = getScope("bob")

autorun(() => {
  console.log("bob.age", bobScope.getProperty("age"))
})

 */
