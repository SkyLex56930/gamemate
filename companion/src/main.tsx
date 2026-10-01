import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import VoiceOverlayPage from "./components/VoiceOverlayPage";

const isVoiceOverlay = new URLSearchParams(window.location.search).get("overlay") === "voice";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isVoiceOverlay ? <VoiceOverlayPage /> : <App />}
  </React.StrictMode>,
);
