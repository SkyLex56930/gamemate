import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { Icon } from "./Icon";
import type { VoiceOverlaySnapshot } from "../lib/voiceOverlay";
import "./VoiceOverlayPage.css";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const previewSnapshot: VoiceOverlaySnapshot = {
  kind: "squad",
  title: "Escouade classée",
  participants: [
    { id: "alex", name: "Alex", avatarUrl: null, muted: false, speaking: false, self: true },
    { id: "nova", name: "Nova", avatarUrl: null, muted: false, speaking: true, self: false },
    { id: "kayo", name: "Kayo", avatarUrl: null, muted: true, speaking: false, self: false },
  ],
};

export default function VoiceOverlayPage() {
  const [snapshot, setSnapshot] = useState<VoiceOverlaySnapshot | null>(isTauri ? null : previewSnapshot);

  useEffect(() => {
    if (!isTauri) return undefined;
    let active = true;
    void invoke<VoiceOverlaySnapshot | null>("get_voice_overlay_state").then((value) => {
      if (active) setSnapshot(value);
    });
    const unlisten = listen<VoiceOverlaySnapshot | null>("voice-overlay:update", (event) => {
      setSnapshot(event.payload);
    });
    return () => {
      active = false;
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  if (!snapshot) return null;

  return (
    <main className="voice-overlay-root">
      <header>
        <img src="/gamemate-mark-transparent.png" alt="" />
        <span><strong>{snapshot.title}</strong><small>{snapshot.kind === "direct" ? "APPEL PRIVÉ" : "VOCAL SQUAD"}</small></span>
      </header>
      <section aria-label="Participants au vocal">
        {snapshot.participants.map((participant) => (
          <article key={participant.id} className={participant.speaking ? "speaking" : ""}>
            <span className="voice-overlay-avatar">
              {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" /> : participant.name.slice(0, 1).toUpperCase()}
              <i />
            </span>
            <strong>{participant.name}{participant.self ? " · toi" : ""}</strong>
            {participant.speaking && !participant.muted ? (
              <span className="voice-overlay-wave" aria-label="Parle actuellement">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</span>
            ) : (
              <span className={participant.muted ? "voice-overlay-mic muted" : "voice-overlay-mic"} aria-label={participant.muted ? "Micro coupé" : "Micro actif"}>
                <Icon name={participant.muted ? "mic-off" : "mic"} size={19} />
              </span>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
