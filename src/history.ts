import { DocHandleChangeEvent, DocumentId } from "automerge-repo"
import { Change, useRepo } from "automerge-repo-react-hooks"
import { Doc, Patch } from "@automerge/automerge"
import { useEffect, useState } from "react"
import { last, lookupPath } from "./utils"

interface DocHistory {
  undoStack: Patch[][]
  redoStack: Patch[][]
  undo: () => void
  redo: () => void
}

export function useDocumentWithHistory<T>(
  documentId: DocumentId
): [doc: Doc<T> | undefined, changeFn: Change<T>, history: DocHistory] {
  const [doc, setDoc] = useState<Doc<T>>()
  const repo = useRepo()
  const handle = documentId ? repo.find<T>(documentId) : null
  const [undoStack, setUndoStack] = useState<Patch[][]>([])
  const [redoStack, setRedoStack] = useState<Patch[][]>([])

  useEffect(() => {
    if (!handle) {
      return
    }
    handle.value().then((v) => setDoc(v as Doc<T>))
    const listener = (h: DocHandleChangeEvent<T>) => setDoc(h.handle.doc as Doc<T>) // TODO: this is kinda gross
    handle.on("change", listener)

    return () => {
      handle.removeListener("change", listener)
    }
  }, [handle])

  const changeDocWithInversePatches = (changeFunction: (d: T) => void): Patch[] => {
    if (!handle) {
      return []
    }

    const inversePatches: Patch[] = []

    handle.change(changeFunction, {
      patchCallback: (patch, prevDoc) => {
        inversePatches.unshift(getInversePatch(patch, prevDoc))
      },
    })

    return inversePatches
  }

  const changeDoc = (changeFunction: (d: T) => void) => {
    const inversePatches = changeDocWithInversePatches(changeFunction)

    setRedoStack([])
    setUndoStack((undoStack) => undoStack.concat([inversePatches]))
    // setUndoStack((undoStack) => undoStack.concat(inversePatches.map((patch) => [patch])))
  }

  const history: DocHistory = {
    undoStack,
    redoStack,
    undo: () => {
      if (undoStack.length === 0 || !doc || !handle) {
        return
      }

      const patches = last(undoStack)
      const inversePatches = changeDocWithInversePatches((doc) => {
        for (const patch of patches) {
          applyPatch<T>(doc, patch)
        }
      })

      setUndoStack((undoStack) => undoStack.slice(0, -1))
      setRedoStack((redoStack) => redoStack.concat([inversePatches]))
    },

    redo: () => {
      if (redoStack.length === 0 || !doc || !handle) {
        return
      }

      const patches = last(redoStack)
      const inversePatches = changeDocWithInversePatches((doc) => {
        for (const patch of patches) {
          applyPatch<T>(doc, patch)
        }
      })

      setUndoStack((undoStack) => undoStack.concat([inversePatches]))
      setRedoStack((redoStack) => redoStack.slice(0, -1))
    },
  }

  return [doc, changeDoc, history]
}

function getInversePatch<T>(patch: Patch, prevDoc: Doc<T>): Patch {
  switch (patch.action) {
    case "splice": {
      const { path, values } = patch

      return {
        action: "del",
        path,
        length: values.length,
      }
    }

    case "del": {
      const { path, length = 1 } = patch
      const parent = lookupPath(prevDoc, path.slice(0, -1))

      if (parent instanceof Array) {
        const index = last(path) as number
        const prevValues = parent.slice(index, index + length)

        return {
          action: "splice",
          path: path,
          values: prevValues,
        }
      }

      const prevValue = lookupPath(prevDoc, path)

      return {
        action: "put",
        path,
        value: prevValue,
      }
    }

    case "put": {
      const { path } = patch
      const prevValue = lookupPath(prevDoc, path)

      if (prevValue === undefined) {
        return {
          action: "del",
          path: path,
        }
      }

      return {
        action: "put",
        path,
        value: prevValue,
      }
    }
  }
}

function applyPatch<T>(doc: Doc<T>, patch: Patch) {
  switch (patch.action) {
    case "splice":
      const { path, values } = patch
      const key = last(path)
      const parent = lookupPath(doc, path.slice(0, -1))

      // parent.splice(parent, key, 0, JSON.parse(JSON.stringify(values)))

      // todo: fix this

      const [g, id, c, index] = path
      doc[g][id][c].splice(index, 0, ...JSON.parse(JSON.stringify(values)))
      return

    case "del": {
      const { path } = patch
      const key = last(path)
      const parent = lookupPath(doc, path.slice(0, -1))
      delete parent[key]
      return
    }

    case "put": {
      const { value, path } = patch
      const key = last(path)
      const parent = lookupPath(doc, path.slice(0, -1))
      parent[key] = value
      return
    }
  }
}
