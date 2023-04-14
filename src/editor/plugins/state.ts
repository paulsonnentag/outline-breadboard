import { Compartment, Facet } from "@codemirror/state"
import { DumbScope } from "../../language/dumb-scopes"

export const nodeIdFacet = Facet.define<string, string>({
  combine: (values) => values[0],
})

export const scopeFacet = Facet.define<DumbScope, DumbScope>({
  combine: (values) => values[0],
})

export const scopeCompartment = new Compartment()
