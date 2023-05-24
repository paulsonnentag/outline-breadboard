import { Compartment, Facet } from "@codemirror/state"
import { Scope } from "../../language/scopes"
import { GraphContextProps } from "../../graph"
import { PopOverValue } from "../../Root"

export const nodeIdFacet = Facet.define<string, string>({
  combine: (values) => values[0],
})

export const scopeFacet = Facet.define<Scope, Scope>({
  combine: (values) => values[0],
})

export const onOpenPopOverFacet = Facet.define<
  (x: number, y: number, value: PopOverValue) => void,
  (x: number, y: number, value: PopOverValue) => void
>({
  combine: (values) => values[0],
})

export const scopeCompartment = new Compartment()

export const graphContextFacet = Facet.define<GraphContextProps, GraphContextProps>({
  combine: (values) => values[0],
})

export const graphContextCompartment = new Compartment()
