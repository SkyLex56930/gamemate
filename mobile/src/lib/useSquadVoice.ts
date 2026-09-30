import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MediaStream, RTCPeerConnection } from "react-native-webrtc";
import { supabase } from "./supabase";

export type VoiceRoom = { squadId: string; channelId: string; channelName: string };
export type VoicePerson = { user_id: string; display_name: string; avatar_url: string | null;
  muted: boolean; deafened: boolean; joined_at: string };
type Signal = { from: string; to: string; kind: "offer" | "answer" | "ice" | "leave";
  description?: { type: string | null; sdp: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };
type RtcApi = typeof import("react-native-webrtc");

function createRtcConfig() {
  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const turnUrls = process.env.EXPO_PUBLIC_WEBRTC_TURN_URLS?.split(",").map((url: string) => url.trim()).filter(Boolean);
  if (turnUrls?.length) iceServers.push({
    urls: turnUrls,
    username: process.env.EXPO_PUBLIC_WEBRTC_TURN_USERNAME,
    credential: process.env.EXPO_PUBLIC_WEBRTC_TURN_CREDENTIAL,
  });
  return { iceServers, iceCandidatePoolSize: 4 };
}

export function useSquadVoice(userId: string) {
  const [room, setRoom] = useState<VoiceRoom | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "joined">("idle");
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<VoicePerson[]>([]);
  const [error, setError] = useState("");

  const generation = useRef(0);
  const rtcRef = useRef<RtcApi | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const iceRef = useRef(new Map<string, NonNullable<Signal["candidate"]>[]>());
  const presenceRef = useRef<VoicePerson | null>(null);
  const roomRef = useRef<VoiceRoom | null>(null);
  const statusRef = useRef<"idle" | "connecting" | "joined">("idle");
  const mutedRef = useRef(false);

  const sendSignal = useCallback((signal: Omit<Signal, "from">) => {
    void channelRef.current?.send({ type: "broadcast", event: "voice-signal", payload: { ...signal, from: userId } });
  }, [userId]);

  const removePeer = useCallback((otherId: string) => {
    const peer = peersRef.current.get(otherId);
    peersRef.current.delete(otherId);
    iceRef.current.delete(otherId);
    peer?.close();
  }, []);

  const dispose = useCallback(() => {
    generation.current += 1;
    if (channelRef.current) {
      sendSignal({ to: "*", kind: "leave" });
      void channelRef.current.untrack();
      void supabase.removeChannel(channelRef.current);
    }
    channelRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const peers = [...peersRef.current.values()];
    peersRef.current.clear(); iceRef.current.clear();
    for (const peer of peers) peer.close();
    rtcRef.current = null; presenceRef.current = null; roomRef.current = null;
    statusRef.current = "idle"; mutedRef.current = false;
  }, [sendSignal]);

  const leave = useCallback(() => {
    dispose();
    setRoom(null); setStatus("idle"); setParticipants([]); setMuted(false); setError("");
  }, [dispose]);

  useEffect(() => () => dispose(), [dispose]);

  const ensurePeer = useCallback((otherId: string) => {
    const existing = peersRef.current.get(otherId);
    if (existing) return existing;
    const rtc = rtcRef.current;
    if (!rtc || !streamRef.current) return null;
    const peer = new rtc.RTCPeerConnection(createRtcConfig());
    streamRef.current.getTracks().forEach((track) => peer.addTrack(track, streamRef.current!));
    peer.onicecandidate = (event: { candidate: { toJSON: () => NonNullable<Signal["candidate"]> } | null }) => {
      if (event.candidate) sendSignal({ to: otherId, kind: "ice", candidate: event.candidate.toJSON() });
    };
    // react-native-webrtc plays incoming audio tracks through the system audio route.
    peer.onconnectionstatechange = () => {
      if (peersRef.current.get(otherId) === peer
        && (peer.connectionState === "failed" || peer.connectionState === "closed")) removePeer(otherId);
    };
    peersRef.current.set(otherId, peer);
    return peer;
  }, [removePeer, sendSignal]);

  const flushIce = useCallback(async (otherId: string, peer: RTCPeerConnection) => {
    const queued = iceRef.current.get(otherId) ?? [];
    iceRef.current.delete(otherId);
    for (const candidate of queued) {
      try { await peer.addIceCandidate(candidate); }
      catch (cause) { console.error("Vocal mobile / ICE :", cause); }
    }
  }, []);

  const createOffer = useCallback(async (otherId: string) => {
    const peer = ensurePeer(otherId);
    if (!peer || peer.signalingState !== "stable") return;
    try {
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      sendSignal({ to: otherId, kind: "offer", description: { type: offer.type, sdp: offer.sdp } });
    } catch (cause) {
      console.error("Vocal mobile / offre :", cause);
      setError("La liaison audio n’a pas pu démarrer. Réessaie.");
    }
  }, [ensurePeer, sendSignal]);

  const syncPresence = useCallback((channel: RealtimeChannel) => {
    const raw = channel.presenceState() as unknown as Record<string, VoicePerson[]>;
    const unique = new Map<string, VoicePerson>();
    for (const entries of Object.values(raw)) {
      for (const person of entries) if (person?.user_id) unique.set(person.user_id, person);
    }
    const people = [...unique.values()];
    setParticipants(people);
    const activeIds = new Set(people.map((person) => person.user_id));
    for (const otherId of peersRef.current.keys()) if (!activeIds.has(otherId)) removePeer(otherId);
    if (!streamRef.current) return;
    for (const person of people) {
      if (person.user_id !== userId && !peersRef.current.has(person.user_id)
        && userId.localeCompare(person.user_id) < 0) void createOffer(person.user_id);
    }
  }, [createOffer, removePeer, userId]);

  const handleSignal = useCallback(async (signal: Signal) => {
    if (!signal || (signal.to !== userId && signal.to !== "*") || signal.from === userId) return;
    if (signal.kind === "leave") { removePeer(signal.from); return; }
    if (signal.to !== userId) return;
    const peer = ensurePeer(signal.from);
    if (!peer) return;
    try {
      if (signal.kind === "offer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        await flushIce(signal.from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({ to: signal.from, kind: "answer", description: { type: answer.type, sdp: answer.sdp } });
      } else if (signal.kind === "answer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        await flushIce(signal.from, peer);
      } else if (signal.kind === "ice" && signal.candidate) {
        if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
        else iceRef.current.set(signal.from, [...(iceRef.current.get(signal.from) ?? []), signal.candidate]);
      }
    } catch (cause) {
      console.error("Vocal mobile / signal :", cause);
      setError("Une liaison vocale a rencontré une erreur. Quitte et rejoins le salon.");
    }
  }, [ensurePeer, flushIce, removePeer, sendSignal, userId]);

  const join = useCallback(async (nextRoom: VoiceRoom, myName: string) => {
    if (roomRef.current?.channelId === nextRoom.channelId && statusRef.current !== "idle") return;
    dispose();
    const currentGeneration = generation.current;
    roomRef.current = nextRoom; statusRef.current = "connecting";
    setRoom(nextRoom); setStatus("connecting"); setError(""); setParticipants([]); setMuted(false);
    try {
      // Load the native module only when joining, so an older installed build can show an actionable error.
      const rtc = await import("react-native-webrtc");
      if (generation.current !== currentGeneration) return;
      rtcRef.current = rtc;
      const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation.current !== currentGeneration) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const channel = supabase.channel(`squad-voice:${nextRoom.squadId}:${nextRoom.channelId}`, {
        config: { private: true, presence: { key: userId }, broadcast: { self: false } },
      });
      channelRef.current = channel;
      channel
        .on("broadcast", { event: "voice-signal" }, ({ payload }) => { void handleSignal(payload as Signal); })
        .on("broadcast", { event: "voice-state" }, ({ payload }) => {
          const update = payload as { user_id?: string; muted?: boolean; deafened?: boolean };
          if (update.user_id) setParticipants((current) => current.map((person) => person.user_id === update.user_id
            ? { ...person, muted: update.muted ?? person.muted, deafened: update.deafened ?? person.deafened } : person));
        })
        .on("presence", { event: "sync" }, () => syncPresence(channel))
        .subscribe(async (subscriptionStatus) => {
          if (generation.current !== currentGeneration) return;
          if (subscriptionStatus === "SUBSCRIBED") {
            try {
              const presence: VoicePerson = {
                user_id: userId, display_name: myName, avatar_url: null,
                muted: false, deafened: false, joined_at: new Date().toISOString(),
              };
              presenceRef.current = presence;
              const tracked = await channel.track(presence);
              if (generation.current !== currentGeneration) return;
              if (tracked !== "ok") throw new Error("presence_track_failed");
              statusRef.current = "joined"; setStatus("joined");
              syncPresence(channel);
            } catch (cause) {
              if (generation.current !== currentGeneration) return;
              console.error("Vocal mobile / présence :", cause);
              dispose(); setStatus("idle"); setRoom(null);
              setError("Connexion au salon impossible. Vérifie ta connexion et réessaie.");
            }
          } else if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT" || subscriptionStatus === "CLOSED") {
            dispose(); setStatus("idle"); setRoom(null);
            setError("Connexion au salon impossible. Vérifie ta connexion et réessaie.");
          }
        });
    } catch (cause) {
      console.error("Vocal mobile / connexion :", cause);
      if (generation.current !== currentGeneration) return;
      dispose(); setStatus("idle"); setRoom(null);
      setError(String(cause).includes("native module")
        ? "Installe la nouvelle version de GameMate pour activer le vocal sur ton téléphone."
        : "Microphone ou connexion au vocal indisponible. Vérifie l’autorisation du micro puis réessaie.");
    }
  }, [dispose, handleSignal, syncPresence, userId]);

  const toggleMute = useCallback(() => {
    if (statusRef.current !== "joined" || !presenceRef.current) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    presenceRef.current = { ...presenceRef.current, muted: next };
    setMuted(next);
    void channelRef.current?.track(presenceRef.current);
    void channelRef.current?.send({ type: "broadcast", event: "voice-state", payload: { user_id: userId, muted: next, speaking: false } });
  }, [userId]);

  return { room, status, muted, participants, error, join, leave, toggleMute };
}
