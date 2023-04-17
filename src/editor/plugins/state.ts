import { Compartment, Facet } from "@codemirror/state"
import { Scope } from "../../language/scopes"

export const nodeIdFacet = Facet.define<string, string>({
  combine: (values) => values[0],
})

export const scopeFacet = Facet.define<Scope, Scope>({
  combine: (values) => values[0],
})

export const scopeCompartment = new Compartment()
