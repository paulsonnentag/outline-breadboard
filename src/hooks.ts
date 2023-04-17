/**
 * Creates a constant reference for the given function.
 * Always returns the same function.
 *
 * @remarks
 *
 * `useCallback` closes over the deps at the time they're passed in, whereas `useStaticCallback`
 * always calls the latest callback. This is generally a good thing, but it's worth noting that it
 * could result in a race condition.
 */
import { useCallback, useRef, useState, useEffect } from "react"
import { DocHandleChangeEvent, DocumentId } from "automerge-repo"
import { Doc } from "@automerge/automerge"
import { Change, useRepo } from "automerge-repo-react-hooks/src"
import { GraphDoc } from "./graph"

export function useStaticCallback<T extends (...args: any[]) => any>(callback: T): T {
  const cb = useRef<T>(callback)
  cb.current = callback

  return useCallback((...args: any[]) => cb.current(...args), []) as T
}
