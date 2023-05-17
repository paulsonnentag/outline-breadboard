import * as localforage from "localforage"

export const computationResultCache = localforage.createInstance({
  name: "computationResultCache",
})
