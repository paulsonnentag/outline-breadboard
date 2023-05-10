import "./wdyr"
import React from "react"
import ReactDOM from "react-dom/client"
import { DocHandle, DocumentId, Repo } from "automerge-repo"
import { RepoContext } from "automerge-repo-react-hooks"
import "./index.css"
import { LocalForageStorageAdapter } from "automerge-repo-storage-localforage"
import { BrowserWebSocketClientAdapter } from "automerge-repo-network-websocket"
import { GraphDoc } from "./graph"
import { Root } from "./Root"
import "material-icons/iconfont/material-icons.css"
import { getProfileDoc } from "./profile"

const url = "ws://67.207.88.83" // cloud sync server on DigitalOcean

const repo = new Repo({
  storage: new LocalForageStorageAdapter(),
  network: [new BrowserWebSocketClientAdapter(url)],
  sharePolicy: (peerId) => peerId.includes("storage-server"),
})

const params = new URLSearchParams(window.location.search)

/*
let documentId = params.get("documentId") as DocumentId
let disableEval = params.get("disableEval") === "true"
let handle: DocHandle<GraphDoc> | undefined = undefined
*/

const profileDoc = getProfileDoc(repo)

/*

;(window as any).exportDoc = () => {
  if (!handle) {
    return
  }

  handle.value().then((value) => {
    console.log("copy out the doc value", { value: JSON.stringify(value) })
  })
}
;(window as any).replaceDoc = async (jsonString: string) => {
  if (!handle) {
    return
  }

  handle.change((doc) => {
    Object.entries(JSON.parse(jsonString)).forEach(([key, value]) => {
      ;(doc as any)[key] = value
    })
  })

  console.log("replace doc")
}


   */

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  //<React.StrictMode>
  <RepoContext.Provider value={repo}>
    <Root profileDocId={profileDoc.documentId} />
  </RepoContext.Provider>
  // </React.StrictMode>
)
