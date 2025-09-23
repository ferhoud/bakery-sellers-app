import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"   // <-- extension .tsx explicite
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Enregistrer le Service Worker en production (URL sw-v5.js)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw-v5.js").then((reg) => {
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" })
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing
        nw?.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            nw.postMessage({ type: "SKIP_WAITING" })
          }
        })
      })
      let refreshed = false
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshed) return
        refreshed = true
        window.location.reload()
      })
    }).catch((err) => console.error("SW registration failed:", err))
  })
}
