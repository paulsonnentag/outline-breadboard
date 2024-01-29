import "./wdyr"
import React from "react"
import ReactDOM from "react-dom/client"
import { Repo } from "@automerge/automerge-repo"
import { RepoContext } from "@automerge/automerge-repo-react-hooks"
import "./index.css"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import { MessageChannelNetworkAdapter } from "@automerge/automerge-repo-network-messagechannel"
import { Root } from "./Root"
import "material-icons/iconfont/material-icons.css"
import { getProfileDoc } from "./profile"
import { registerRepo } from "./graph"

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [],
  sharePolicy: (peerId) => Promise.resolve(peerId.includes("shared-worker")),
})

registerRepo(repo)

const profileDocHandle = getProfileDoc(repo)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  //<React.StrictMode>
  <RepoContext.Provider value={repo}>
    <Root profileDocId={profileDocHandle.documentId} />
  </RepoContext.Provider>
  // </React.StrictMode>
)
