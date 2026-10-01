import { invoke } from "@tauri-apps/api/core";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { useEffect, useMemo, useState } from "react";

import type { DirectVoiceOverlaySnapshot } from "./DirectCallManager";
import type { VoiceSessionSnapshot } from "./SquadVoiceRoom";
import {
  globalVoiceCommandEvent,
  readVoiceOverlaySettings,
  voiceOverlaySettingsEvent,
  type VoiceOverlaySettings,
  type VoiceOverlaySnapshot,
} from "../lib/voiceOverlay";

type Props = {
  squadSession: VoiceSessionSnapshot | null;
  directSession: DirectVoiceOverlaySnapshot | null;
};

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
let shortcutRegistrationQueue = Promise.resolve();

export default function VoiceOverlayManager({ squadSession, directSession }: Props) {
  const [settings, setSettings] = useState<VoiceOverlaySettings>(readVoiceOverlaySettings);
  const [temporarilyHidden, setTemporarilyHidden] = useState(false);

  useEffect(() => {
    const handleSettings = (event: Event) => {
      setSettings((event as CustomEvent<VoiceOverlaySettings>).detail ?? readVoiceOverlaySettings());
      setTemporarilyHidden(false);
    };
    window.addEventListener(voiceOverlaySettingsEvent, handleSettings);
    return () => window.removeEventListener(voiceOverlaySettingsEvent, handleSettings);
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    const shortcuts = [settings.muteShortcut, settings.deafenShortcut, settings.visibilityShortcut];
    let disposed = false;

    shortcutRegistrationQueue = shortcutRegistrationQueue.then(async () => {
      if (disposed) return;
      try {
        await register(shortcuts, (event) => {
          if (event.state !== "Pressed") return;
          if (event.shortcut === settings.visibilityShortcut) {
            setTemporarilyHidden((hidden) => !hidden);
            return;
          }
          window.dispatchEvent(new CustomEvent(globalVoiceCommandEvent, {
            detail: { action: event.shortcut === settings.muteShortcut ? "toggle-mute" : "toggle-deafen" },
          }));
        });
        if (disposed) await unregister(shortcuts).catch(() => undefined);
      } catch (error) {
        if (!disposed) console.error("GameMate global voice shortcuts:", error);
      }
    });
    return () => {
      disposed = true;
      shortcutRegistrationQueue = shortcutRegistrationQueue.then(() => unregister(shortcuts).catch(() => undefined));
    };
  }, [settings]);

  const snapshot = useMemo<VoiceOverlaySnapshot | null>(() => {
    if (directSession) return directSession;
    if (!squadSession?.joined) return null;
    return {
      kind: "squad",
      title: squadSession.channelName,
      participants: squadSession.participants,
    };
  }, [directSession, squadSession]);

  useEffect(() => {
    if (!isTauri) return;
    const visibleSnapshot = settings.enabled && !temporarilyHidden ? snapshot : null;
    void invoke("sync_voice_overlay", { snapshot: visibleSnapshot }).catch((error) => {
      console.error("GameMate voice overlay:", error);
    });
  }, [settings.enabled, snapshot, temporarilyHidden]);

  return null;
}
