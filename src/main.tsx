import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Enregistrer le Service Worker en production
// Enregistrer le Service Worker en production (avec auto-update)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Si un nouveau SW est prêt (waiting), on bascule dessus
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      // Quand le contrôleur change (nouveau SW actif), on recharge une fois
      let refreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshed) return;
        refreshed = true;
        window.location.reload();
      });
    }).catch((err) => console.error("SW registration failed:", err));
  });
}
