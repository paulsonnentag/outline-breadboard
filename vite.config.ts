import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"

export default defineConfig(({ command, mode }) => {
  const env = process.env.VITE_VERCEL_ENV ?? loadEnv(mode, process.cwd(), "")

  console.log("BUILD", process.env.VITE_VERCEL_ENV)

  return {
    base: "/",
    plugins: [wasm(), topLevelAwait(), react()],
    worker: {
      format: "es",
      plugins: [wasm(), topLevelAwait()],
    },

    optimizeDeps: {
      // This is necessary because otherwise `vite dev` includes two separate
      // versions of the JS wrapper. This causes problems because the JS
      // wrapper has a module level variable to track JS side heap
      // allocations, initializing this twice causes horrible breakage
      exclude: [
        "@automerge/automerge-wasm",
        "@automerge/automerge-wasm/bundler/bindgen_bg.wasm",
        "@syntect/wasm",
      ],
    },

    resolve: {
      alias: {
        path: "path-browserify",
      },
    },

    define: {
      __APP_ENV__: { foo: "bar" },
    },

    server: {
      fs: {
        strict: false,
      },
      hmr: false,
    },
  }
})
