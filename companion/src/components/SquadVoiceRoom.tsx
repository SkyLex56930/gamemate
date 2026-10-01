import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  applyPreferredOutput,
  createMicrophoneConstraints,
  friendlyMediaError,
  readAudioDevicePreferences,
} from "../lib/mediaDevices";
import { createRtcConfig, supportsVoiceCalls } from "../lib/webrtc";
import { Icon } from "./Icon";
import type { VoiceOverlayParticipant } from "../lib/voiceOverlay";

export type SquadMember = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type VoicePresence = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  muted: boolean;
  deafened: boolean;
  joined_at: string;
};

type VoiceParticipant = VoicePresence & {
  speaking: boolean;
};

type VoiceSignal = {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice" | "leave";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type VoiceStateMessage = {
  user_id: string;
  muted?: boolean;
  deafened?: boolean;
  speaking?: boolean;
};

export type VoiceSessionSnapshot = {
  squadId: string;
  channelId: string;
  channelName: string;
  joined: boolean;
  connecting: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  participantCount: number;
  participants: VoiceOverlayParticipant[];
};

type VoiceCommand = {
  action: "toggle-mute" | "toggle-deafen" | "leave";
  channelId?: string;
};

type Props = {
  squadId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
  members: SquadMember[];
  onStateChange?: (snapshot: VoiceSessionSnapshot | null) => void;
};

export default function SquadVoiceRoom({
  squadId,
  channelId,
  channelName,
  currentUserId,
  members,
  onStateChange,
}: Props) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerStates, setPeerStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingFrameRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const mountedRef = useRef(true);
  const presenceRef = useRef<VoicePresence | null>(null);

  const me = members.find((member) => member.user_id === currentUserId);
  const myName = me?.display_name || me?.username || "Joueur";
  const supported = supportsVoiceCalls();

  const sendBroadcast = useCallback((event: string, payload: unknown) => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event, payload });
  }, []);

  const patchParticipant = useCallback((userId: string, patch: Partial<VoiceParticipant>) => {
    setParticipants((current) => current.map((participant) => (
      participant.user_id === userId ? { ...participant, ...patch } : participant
    )));
  }, []);

  const removePeer = useCallback((remoteUserId: string) => {
    const peer = peersRef.current.get(remoteUserId);
    if (peer) peer.close();
    peersRef.current.delete(remoteUserId);
    pendingIceRef.current.delete(remoteUserId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[remoteUserId];
      return next;
    });
    setPeerStates((current) => {
      const next = { ...current };
      delete next[remoteUserId];
      return next;
    });
  }, []);

  const sendSignal = useCallback((signal: Omit<VoiceSignal, "from">) => {
    sendBroadcast("voice-signal", { ...signal, from: currentUserId } satisfies VoiceSignal);
  }, [currentUserId, sendBroadcast]);

  const ensurePeer = useCallback((remoteUserId: string) => {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) return existing;

    const peer = new RTCPeerConnection(createRtcConfig());
    const stream = localStreamRef.current;
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal({
        to: remoteUserId,
        kind: "ice",
        candidate: event.candidate.toJSON(),
      });
    };

    peer.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [remoteUserId]: remoteStream }));
    };

    peer.onconnectionstatechange = () => {
      setPeerStates((current) => ({ ...current, [remoteUserId]: peer.connectionState }));
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        removePeer(remoteUserId);
      }
    };

    peersRef.current.set(remoteUserId, peer);
    setPeerStates((current) => ({ ...current, [remoteUserId]: "new" }));
    return peer;
  }, [removePeer, sendSignal]);

  const flushPendingIce = useCallback(async (remoteUserId: string, peer: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(remoteUserId) ?? [];
    pendingIceRef.current.delete(remoteUserId);
    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (nextError) {
        console.error("GameMate voice ICE:", nextError);
      }
    }
  }, []);

  const createOffer = useCallback(async (remoteUserId: string) => {
    const peer = ensurePeer(remoteUserId);
    if (peer.signalingState !== "stable") return;
    try {
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      sendSignal({
        to: remoteUserId,
        kind: "offer",
        description: { type: offer.type, sdp: offer.sdp },
      });
    } catch (nextError) {
      console.error("GameMate voice offer:", nextError);
      setError("La connexion vocale n’a pas pu être négociée.");
    }
  }, [ensurePeer, sendSignal]);

  const handleSignal = useCallback(async (signal: VoiceSignal) => {
    if (!signal || signal.to !== currentUserId || signal.from === currentUserId) return;

    if (signal.kind === "leave") {
      removePeer(signal.from);
      return;
    }

    const peer = ensurePeer(signal.from);
    try {
      if (signal.kind === "offer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        await flushPendingIce(signal.from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({
          to: signal.from,
          kind: "answer",
          description: { type: answer.type, sdp: answer.sdp },
        });
        return;
      }

      if (signal.kind === "answer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        await flushPendingIce(signal.from, peer);
        return;
      }

      if (signal.kind === "ice" && signal.candidate) {
        if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
        else {
          const queued = pendingIceRef.current.get(signal.from) ?? [];
          pendingIceRef.current.set(signal.from, [...queued, signal.candidate]);
        }
      }
    } catch (nextError) {
      console.error("GameMate voice signal:", nextError);
      setError("Une liaison vocale a rencontré une erreur.");
    }
  }, [currentUserId, ensurePeer, flushPendingIce, removePeer, sendSignal]);

  const syncPresence = useCallback((channel: RealtimeChannel) => {
    const raw = channel.presenceState() as Record<string, VoicePresence[]>;
    const unique = new Map<string, VoiceParticipant>();
    for (const entries of Object.values(raw)) {
      for (const entry of entries) {
        if (!entry?.user_id) continue;
        const existing = unique.get(entry.user_id);
        unique.set(entry.user_id, {
          ...entry,
          speaking: existing?.speaking ?? false,
        });
      }
    }

    const nextParticipants = [...unique.values()];
    setParticipants((current) => nextParticipants.map((participant) => ({
      ...participant,
      speaking: current.find((item) => item.user_id === participant.user_id)?.speaking ?? false,
    })));

    const activeIds = new Set(nextParticipants.map((participant) => participant.user_id));
    for (const remoteUserId of peersRef.current.keys()) {
      if (!activeIds.has(remoteUserId)) removePeer(remoteUserId);
    }

    for (const participant of nextParticipants) {
      if (participant.user_id === currentUserId) continue;
      if (!peersRef.current.has(participant.user_id) && currentUserId.localeCompare(participant.user_id) < 0) {
        void createOffer(participant.user_id);
      }
    }
  }, [createOffer, currentUserId, removePeer]);

  const publishVoiceState = useCallback((patch: Omit<VoiceStateMessage, "user_id">) => {
    patchParticipant(currentUserId, patch);
    sendBroadcast("voice-state", { user_id: currentUserId, ...patch } satisfies VoiceStateMessage);
    if (presenceRef.current && (typeof patch.muted === "boolean" || typeof patch.deafened === "boolean")) {
      presenceRef.current = {
        ...presenceRef.current,
        ...(typeof patch.muted === "boolean" ? { muted: patch.muted } : {}),
        ...(typeof patch.deafened === "boolean" ? { deafened: patch.deafened } : {}),
      };
      if (channelRef.current) void channelRef.current.track(presenceRef.current);
    }
  }, [currentUserId, patchParticipant, sendBroadcast]);

  const applyVoiceControls = useCallback((nextMuted: boolean, nextDeafened: boolean) => {
    const resolvedMuted = nextDeafened ? true : nextMuted;
    mutedRef.current = resolvedMuted;
    deafenedRef.current = nextDeafened;
    setMuted(resolvedMuted);
    setDeafened(nextDeafened);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !resolvedMuted;
    });
    if (resolvedMuted) {
      speakingRef.current = false;
      setLocalSpeaking(false);
    }
    publishVoiceState({
      muted: resolvedMuted,
      deafened: nextDeafened,
      speaking: resolvedMuted ? false : speakingRef.current,
    });
  }, [publishVoiceState]);

  const stopSpeakingMeter = useCallback(() => {
    if (speakingFrameRef.current !== null) cancelAnimationFrame(speakingFrameRef.current);
    speakingFrameRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
    speakingRef.current = false;
    setLocalSpeaking(false);
  }, []);

  const startSpeakingMeter = useCallback((stream: MediaStream) => {
    stopSpeakingMeter();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    const samples = new Uint8Array(analyser.fftSize);
    let lastChange = 0;

    const measure = (timestamp: number) => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / samples.length);
      const nextSpeaking = !mutedRef.current && rms > 0.035;
      if (nextSpeaking !== speakingRef.current && timestamp - lastChange > 280) {
        speakingRef.current = nextSpeaking;
        lastChange = timestamp;
        setLocalSpeaking(nextSpeaking);
        publishVoiceState({ speaking: nextSpeaking });
      }
      speakingFrameRef.current = requestAnimationFrame(measure);
    };
    speakingFrameRef.current = requestAnimationFrame(measure);
  }, [publishVoiceState, stopSpeakingMeter]);

  const leaveVoice = useCallback(() => {
    if (channelRef.current) {
      sendSignal({ to: "*", kind: "leave" });
      void channelRef.current.untrack();
      void supabase.removeChannel(channelRef.current);
    }
    channelRef.current = null;
    presenceRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    pendingIceRef.current.clear();
    stopSpeakingMeter();
    setJoined(false);
    setConnecting(false);
    setMuted(false);
    setDeafened(false);
    mutedRef.current = false;
    deafenedRef.current = false;
    setParticipants([]);
    setRemoteStreams({});
    setPeerStates({});
  }, [sendSignal, stopSpeakingMeter]);

  const joinVoice = useCallback(async () => {
    if (!supported || joined || connecting) return;
    setConnecting(true);
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: createMicrophoneConstraints(readAudioDevicePreferences()),
        video: false,
      });
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });

      const topic = `squad-voice:${squadId}:${channelId}`;
      const options = {
        config: {
          private: true,
          presence: { key: currentUserId },
          broadcast: { self: false },
        },
      } as Parameters<typeof supabase.channel>[1];

      const channel = supabase.channel(topic, options);
      channelRef.current = channel;

      channel
        .on("broadcast", { event: "voice-signal" }, ({ payload }: { payload: unknown }) => {
          const signal = payload as VoiceSignal;
          if (signal.to === "*" && signal.kind === "leave") removePeer(signal.from);
          else void handleSignal(signal);
        })
        .on("broadcast", { event: "voice-state" }, ({ payload }: { payload: unknown }) => {
          const state = payload as VoiceStateMessage;
          if (state?.user_id) patchParticipant(state.user_id, state);
        })
        .on("presence", { event: "sync" }, () => syncPresence(channel))
        .subscribe(async (status, subscribeError) => {
          if (!mountedRef.current) return;
          if (status === "SUBSCRIBED") {
            const presence: VoicePresence = {
              user_id: currentUserId,
              display_name: myName,
              avatar_url: me?.avatar_url ?? null,
              muted: false,
              deafened: false,
              joined_at: new Date().toISOString(),
            };
            presenceRef.current = presence;
            await channel.track(presence);
            setJoined(true);
            setConnecting(false);
            startSpeakingMeter(stream);
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("GameMate voice channel:", subscribeError);
            setError("Accès au salon refusé ou connexion Realtime indisponible.");
            leaveVoice();
          }
        });
    } catch (nextError) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setConnecting(false);
      setError(friendlyMediaError(nextError));
    }
  }, [channelId, connecting, currentUserId, handleSignal, joined, leaveVoice, me?.avatar_url, myName, patchParticipant, removePeer, squadId, startSpeakingMeter, supported, syncPresence]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      leaveVoice();
      onStateChange?.(null);
    };
  }, [channelId, leaveVoice, onStateChange, squadId]);

  useEffect(() => {
    onStateChange?.({
      squadId,
      channelId,
      channelName,
      joined,
      connecting,
      muted,
      deafened,
      speaking: localSpeaking,
      participantCount: participants.length,
      participants: participants.map((participant) => ({
        id: participant.user_id,
        name: participant.display_name,
        avatarUrl: participant.avatar_url,
        muted: participant.muted,
        speaking: participant.user_id === currentUserId ? localSpeaking : participant.speaking,
        self: participant.user_id === currentUserId,
      })),
    });
  }, [channelId, channelName, connecting, currentUserId, deafened, joined, localSpeaking, muted, onStateChange, participants, squadId]);

  useEffect(() => {
    const handleVoiceCommand = (event: Event) => {
      const command = (event as CustomEvent<VoiceCommand>).detail;
      if (!command || (command.channelId && command.channelId !== channelId)) return;

      if (command.action === "leave") {
        leaveVoice();
        return;
      }

      if (!joined) return;

      if (command.action === "toggle-mute") {
        applyVoiceControls(!mutedRef.current, deafenedRef.current);
      } else if (command.action === "toggle-deafen") {
        const nextDeafened = !deafenedRef.current;
        applyVoiceControls(mutedRef.current, nextDeafened);
      }
    };

    window.addEventListener("gamemate:voice-command", handleVoiceCommand);
    window.addEventListener("gamemate:global-voice-command", handleVoiceCommand);
    return () => {
      window.removeEventListener("gamemate:voice-command", handleVoiceCommand);
      window.removeEventListener("gamemate:global-voice-command", handleVoiceCommand);
    };
  }, [applyVoiceControls, channelId, joined, leaveVoice]);
function toggleMute() {
    applyVoiceControls(!mutedRef.current, deafenedRef.current);
  }

  function toggleDeafen() {
    const next = !deafenedRef.current;
    applyVoiceControls(mutedRef.current, next);
  }

  function changeVolume(userId: string, value: number) {
    setVolumes((current) => ({ ...current, [userId]: value }));
    localStorage.setItem(`gamemate-voice-volume:${userId}`, String(value));
  }

  const onlineIds = new Set(participants.map((participant) => participant.user_id));
  const absentMembers = members.filter((member) => !onlineIds.has(member.user_id));

  return (
    <section className="voice-room">
      <header className="voice-room-head">
        <div className={`voice-room-orb ${joined ? "connected" : ""} ${localSpeaking ? "speaking" : ""}`}>
          <span><Icon name="headphones" /></span><i /><b />
        </div>
        <div>
          <span className="team-kicker">SALON VOCAL SÉCURISÉ</span>
          <h2>{channelName}</h2>
          <p>Audio direct entre les membres de la squad. Aucun enregistrement.</p>
        </div>
        <span className={`voice-room-state ${joined ? "online" : ""}`}><i />{joined ? "CONNECTÉ" : connecting ? "CONNEXION…" : "HORS LIGNE"}</span>
      </header>

      {error && <div className="voice-room-error"><span><Icon name="alert-circle" size={16} /></span>{error}</div>}

      {!supported ? (
        <div className="voice-room-unsupported"><strong>WebRTC indisponible</strong><p>Cette version du WebView Windows ne permet pas encore le vocal.</p></div>
      ) : !joined ? (
        <div className="voice-room-join">
          <div>
            <span>VOCAL GAMEMATE · BÊTA</span>
            <h3>Prêt à rejoindre la squad ?</h3>
            <p>GameMate utilisera le microphone, la sortie et les traitements choisis dans tes paramètres audio.</p>
          </div>
          <ul>
            <li><span><Icon name="check" size={15} /></span>Microphone sélectionné</li>
            <li><span><Icon name="check" size={15} /></span>Réduction du bruit</li>
            <li><span><Icon name="check" size={15} /></span>Connexion chiffrée WebRTC</li>
          </ul>
          <button type="button" disabled={connecting} onClick={() => void joinVoice()}>{connecting ? "Connexion au salon…" : "Rejoindre le vocal"}</button>
        </div>
      ) : (
        <div className="voice-room-workspace">
          <div className="voice-room-roster">
            <div className="voice-room-section-title"><span>CONNECTÉS</span><b>{participants.length}</b></div>
            {participants.map((participant) => {
              const isMe = participant.user_id === currentUserId;
              const volume = volumes[participant.user_id] ?? readSavedVolume(participant.user_id);
              const connection = isMe ? "connected" : peerStates[participant.user_id] ?? "connecting";
              return (
                <article key={participant.user_id} className={`voice-person ${participant.speaking || (isMe && localSpeaking) ? "speaking" : ""}`}>
                  <Avatar url={participant.avatar_url} name={participant.display_name} />
                  <div className="voice-person-copy"><strong>{participant.display_name}{isMe ? " (toi)" : ""}</strong><small>{participant.muted ? "Micro coupé" : connectionLabel(connection)}</small></div>
                  <div className="voice-person-icons">{participant.deafened && <span title="Sourd"><Icon name="volume-x" size={15} /></span>}{participant.muted && <span title="Micro coupé"><Icon name="mic-off" size={15} /></span>}</div>
                  {!isMe && (
                  <label className="voice-person-volume"><span>VOL.</span><input type="range" min="0" max="100" value={volume} style={{ "--voice-volume": `${volume}%` } as CSSProperties} onChange={(event: ChangeEvent<HTMLInputElement>) => changeVolume(participant.user_id, Number(event.target.value))} /><b>{volume}</b></label>
                  )}
                  {!isMe && remoteStreams[participant.user_id] && <RemoteAudio stream={remoteStreams[participant.user_id]} volume={volume} deafened={deafened} />}
                </article>
              );
            })}

            {absentMembers.length > 0 && (
              <>
                <div className="voice-room-section-title muted"><span>HORS DU VOCAL</span><b>{absentMembers.length}</b></div>
                {absentMembers.map((member) => (
                  <article key={member.user_id} className="voice-person absent"><Avatar url={member.avatar_url} name={member.display_name || member.username || "Joueur"} /><div className="voice-person-copy"><strong>{member.display_name || member.username || "Joueur"}</strong><small>Non connecté au salon</small></div></article>
                ))}
              </>
            )}
          </div>

          <aside className="voice-room-console">
            <span className="team-kicker">CONTRÔLES</span>
            <h3>Console vocale</h3>
            <p>Les changements sont appliqués immédiatement à cette session.</p>
            <div className="voice-room-controls">
              <button type="button" className={muted ? "active danger" : ""} onClick={toggleMute}><span><Icon name={muted ? "mic-off" : "mic"} /></span><strong>{muted ? "Réactiver" : "Couper le micro"}</strong><small>{muted ? "Ton micro est coupé" : "Les autres t’entendent"}</small></button>
              <button type="button" className={deafened ? "active danger" : ""} onClick={toggleDeafen}><span><Icon name={deafened ? "volume-x" : "headphones"} /></span><strong>{deafened ? "Réactiver le son" : "Mode sourd"}</strong><small>{deafened ? "Tu n’entends personne" : "Audio des membres actif"}</small></button>
            </div>
            <div className="voice-room-privacy"><span><Icon name="shield" /></span><div><strong>Confidentialité</strong><small>L’audio ne transite pas par la base de données GameMate et n’est pas enregistré.</small></div></div>
            <button type="button" className="voice-room-leave" onClick={leaveVoice}>Quitter le vocal</button>
          </aside>
        </div>
      )}
    </section>
  );
}

function RemoteAudio({ stream, volume, deafened }: { stream: MediaStream; volume: number; deafened: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.srcObject = stream;
    audio.volume = volume / 100;
    audio.muted = deafened;
    void applyPreferredOutput(audio).then(() => audio.play()).catch(() => undefined);
    const updateOutput = () => void applyPreferredOutput(audio).catch(() => undefined);
    window.addEventListener("gamemate-audio-devices-changed", updateOutput);
    return () => {
      window.removeEventListener("gamemate-audio-devices-changed", updateOutput);
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume / 100;
    audioRef.current.muted = deafened;
  }, [deafened, volume]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return <span className="voice-avatar">{url ? <img src={url} alt="" /> : name.slice(0, 1).toUpperCase()}</span>;
}

function readSavedVolume(userId: string) {
  const value = Number(localStorage.getItem(`gamemate-voice-volume:${userId}`));
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 100;
}

function connectionLabel(state: RTCPeerConnectionState | "connecting") {
  if (state === "connected") return "Audio connecté";
  if (state === "failed") return "Connexion impossible";
  if (state === "disconnected") return "Reconnexion…";
  return "Connexion audio…";
}
