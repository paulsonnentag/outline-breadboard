import { DocHandle, DocumentId, Repo } from "automerge-repo"
import { createGraphDoc, createRecordNode } from "./graph"

export interface ProfileDoc {
  graphIds: DocumentId[]
  settingsGraphId: DocumentId
  settingsNodeId: string
}

const PROFILE_ID = "PROFILE_ID"

export function getProfileDoc(repo: Repo): DocHandle<ProfileDoc> {
  const profileId = localStorage.getItem(PROFILE_ID)

  if (profileId) {
    return repo.find<ProfileDoc>(profileId as DocumentId)
  }

  const handle = repo.create<ProfileDoc>()
  handle.change((doc) => {
    const emptyGraphHandle = createGraphDoc(repo)
    const settingsGraphHandle = createGraphDoc(repo)

    settingsGraphHandle.change((settingsGraphDoc) => {
      const settingsNode = createRecordNode(settingsGraphDoc.graph, {
        name: "Settings",
        props: [
          ["lengthUnit", "kilometers"],
          ["temperatureUnit", "celsius"],
        ],
      })

      settingsGraphDoc.rootNodeIds = [settingsNode.id]
    })

    doc.graphIds = [emptyGraphHandle.documentId]
    doc.settingsGraphId = settingsGraphHandle.documentId
  })

  localStorage.setItem(PROFILE_ID, handle.documentId)
  return handle
}
