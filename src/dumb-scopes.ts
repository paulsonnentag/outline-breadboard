import { parseBullet } from "./language"
import { AstNode, BulletNode } from "./language/ast"

interface Node {
  id: string
  source: string
  childIds: string[]
}

const graph: { [id: string]: Node } = {
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
    source: "computed: {bob.nextAge + 1}",
    childIds: [],
  },
}

export class DumbScope {
  parentScope: DumbScope | undefined
  data: { [name: string]: any } = {}
  childScopes: DumbScope[] = []
  bullet: BulletNode

  private onUpdate: () => void
  private resolve: (x: any) => void = () => {}

  constructor(id: string, parentScope: DumbScope | undefined, onUpdate: () => void) {
    const node = graph[id]

    this.parentScope = parentScope
    this.onUpdate = onUpdate
    this.bullet = parseBullet(node.source)
    const pendingValue = new Promise((resolve) => {
      this.resolve = resolve
    })

    this.data.$value = pendingValue

    if (this.bullet.key && parentScope && !parentScope.data[this.bullet.key]) {
      parentScope.data[this.bullet.key] = this.data
    }

    for (const childId of node.childIds) {
      this.childScopes.push(new DumbScope(childId, this, onUpdate))
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
      this.onUpdate()
    })

    for (const childScope of this.childScopes) {
      childScope.eval()
    }
  }
}

const scope = new DumbScope("root", undefined, () => {})

scope.eval()

export function getValue(obj: any) {
  if (obj && obj.$value) {
    return obj.$value
  }

  return obj
}
