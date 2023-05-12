import { DocHandle, DocumentId, Repo } from "automerge-repo"
import { createGraphDoc, createRecordNode, GraphDoc } from "./graph"
import { EXAMPLES } from "./examples"

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
    const settingsGraphHandle = createGraphDoc(repo)

    settingsGraphHandle.change((settingsGraphDoc) => {
      const settingsNode = createRecordNode(settingsGraphDoc.graph, {
        name: "Settings",
        props: [
          ["lengthUnit", "kilometers"],
          ["options", "kilometers, miles"],
          ["", ""],
          ["temperatureUnit", "celsius"],
          ["options", "celsius, fahrenheit"],
        ],
      })

      settingsGraphDoc.rootNodeIds = [settingsNode.id]
    })

    doc.graphIds = []
    doc.settingsGraphId = settingsGraphHandle.documentId

    EXAMPLES.forEach((example) => {
      importGraph(repo, handle.documentId, example)
    })
  })

  localStorage.setItem(PROFILE_ID, handle.documentId)
  return handle
}

export function importGraph(repo: Repo, profileId: DocumentId, graphData: GraphDoc): DocumentId {
  const profileHandle = repo.find<ProfileDoc>(profileId)

  const graphDocHandle = repo.create<GraphDoc>()

  graphDocHandle.change((doc) => {
    doc.graph = graphData.graph
    doc.cache = graphData.cache
    doc.rootNodeIds = graphData.rootNodeIds

    profileHandle.change((profileDoc) => {
      if (!profileDoc.graphIds.includes(graphDocHandle.documentId)) {
        profileDoc.graphIds.push(graphDocHandle.documentId)
      }
    })
  })

  return graphDocHandle.documentId
}
