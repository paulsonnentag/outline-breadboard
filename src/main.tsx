import "./wdyr"
import React from "react"
import ReactDOM from "react-dom/client"
import { Repo } from "automerge-repo"
import { RepoContext } from "automerge-repo-react-hooks"
import "./index.css"
import { LocalForageStorageAdapter } from "automerge-repo-storage-localforage"
import { BrowserWebSocketClientAdapter } from "automerge-repo-network-websocket"
import { Root } from "./Root"
import "material-icons/iconfont/material-icons.css"
import { getProfileDoc } from "./profile"

const url = "ws://67.207.88.83" // cloud sync server on DigitalOcean

// @ts-ignore
const IS_VERCEL = __IS_VERCEL__

const repo = new Repo({
  storage: new LocalForageStorageAdapter(),
  // disable websockets on Vercel until sync server has SSL certificate
  network: IS_VERCEL ? [] : [new BrowserWebSocketClientAdapter(url)],
  sharePolicy: (peerId) => peerId.includes("storage-server"),
})

const profileDocHandle = getProfileDoc(repo)

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
    <Root profileDocId={profileDocHandle.documentId} />
  </RepoContext.Provider>
  // </React.StrictMode>
)
