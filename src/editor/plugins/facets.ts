import { Facet } from "@codemirror/state"

export const nodeIdFacet = Facet.define<string, string>({
  combine: (values) => values[0],
})

export const parentIdsFacet = Facet.define<string[], string[]>({
  combine: (values) => values[0],
})
