import { DocHandleChangeEvent, DocumentId } from "automerge-repo"
import { Change, useRepo } from "automerge-repo-react-hooks"
import { Doc, Patch, Prop } from "@automerge/automerge"
import { useEffect, useMemo, useRef, useState } from "react"
import { last, lookupPath } from "./utils"
import { Value } from "@automerge/automerge-wasm"

interface DocHistory {
  undoStack: Patch[]
  redoStack: Patch[]
  undo: () => void
  redo: () => void
}

export function useDocumentWithHistory<T>(
  documentId: DocumentId
): [doc: Doc<T> | undefined, changeFn: Change<T>, history: DocHistory] {
  const [doc, setDoc] = useState<Doc<T>>()
  const repo = useRepo()
  const handle = documentId ? repo.find<T>(documentId) : null
  const [undoStack, setUndoStack] = useState<Patch[]>([])
  const [redoStack, setRedoStack] = useState<Patch[]>([])

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

  const _changeDoc = (changeFunction: (d: T) => void, withoutHistory: boolean = false) => {
    if (!handle) {
      return
    }
    handle.change(changeFunction, {
      patchCallback: (patch, prevDoc) => {
        if (withoutHistory) {
          return
        }

        setRedoStack([])
        setUndoStack((undoStack) => undoStack.concat(getInversePatch(patch, prevDoc)))
      },
    })
  }

  const changeDoc = (changeFunction: (d: T) => void) => {
    _changeDoc(changeFunction)
  }

  const history: DocHistory = {
    undoStack,
    redoStack,
    undo: () => {
      if (undoStack.length === 0 || !doc) {
        return
      }

      const patch = last(undoStack)
      setRedoStack((redoStack) => redoStack.concat(getInversePatch(patch, doc)))
      _changeDoc((doc) => applyPatch<T>(doc, patch), true)
      setUndoStack((undoStack) => undoStack.slice(0, -1))
    },

    redo: () => {
      if (redoStack.length === 0 || !doc) {
        return
      }

      const patch = last(redoStack)

      setUndoStack((undoStack) => undoStack.concat(getInversePatch(patch, doc)))
      _changeDoc((doc) => applyPatch<T>(doc, patch), true)
      setRedoStack((redoStack) => redoStack.slice(0, -1))
    },
  }

  return [doc, changeDoc, history]
}

function getInversePatch<T>(patch: Patch, prevDoc: Doc<T>): Patch {
  switch (patch.action) {
    case "splice":
      throw new Error("not implemented")

    case "del":
      throw new Error("not implemented")

    case "put": {
      const { path } = patch
      const prevValue = lookupPath(prevDoc, path)

      if (!prevValue) {
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
      console.warn("not implemented")
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
