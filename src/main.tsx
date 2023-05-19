import "./wdyr"
import React from "react"
import ReactDOM from "react-dom/client"
import { Repo } from "automerge-repo"
import { RepoContext } from "automerge-repo-react-hooks"
import "./index.css"
import { LocalForageStorageAdapter } from "automerge-repo-storage-localforage"
import { BrowserWebSocketClientAdapter } from "automerge-repo-network-websocket"
import { MessageChannelNetworkAdapter } from "automerge-repo-network-messagechannel"
import { Root } from "./Root"
import "material-icons/iconfont/material-icons.css"
import { getProfileDoc } from "./profile"
import { registerRepo } from "./graph"

const url = "ws://67.207.88.83" // cloud sync server on DigitalOcean

// FIXME - had an issue with shared worker missing the connect message on the first startup
// if it was also loading wasm - unsure what the issue is but repeating the sharedworker
// in the only workaround we have at the moment
function createSharedWorker(): Promise<SharedWorker> {
  return new Promise((resolve) => {
    let interval = setInterval(() => {
      let worker = new SharedWorker(new URL("./shared-worker.ts", import.meta.url), {
        type: "module",
        name: "automerge-repo-shared-worker",
      })
      worker.port.onmessage = (e) => {
        if (e.data === "READY") {
          clearInterval(interval)
          resolve(worker)
        }
      }
    }, 100)
  })
}

let sharedWorker = await createSharedWorker()

function setupSharedWorkerAndRepo() {
  const repoNetworkChannel = new MessageChannel()
  sharedWorker.port.postMessage({ repoNetworkPort: repoNetworkChannel.port2 }, [
    repoNetworkChannel.port2,
  ])

  const repo = new Repo({
    storage: new LocalForageStorageAdapter(),
    network: [new BrowserWebSocketClientAdapter(url)],
    sharePolicy: (peerId) => peerId.includes("storage-server"),
  })

  registerRepo(repo)
  return repo
}

const repo = setupSharedWorkerAndRepo()

const profileDocHandle = getProfileDoc(repo)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  //<React.StrictMode>
  <RepoContext.Provider value={repo}>
    <Root profileDocId={profileDocHandle.documentId} />
  </RepoContext.Provider>
  // </React.StrictMode>
)
