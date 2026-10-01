import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playNotificationSound, playOutgoingCallTone } from "../lib/audio";
import { prepareNativeNotifications, showIncomingCallNotification } from "../lib/nativeNotifications";
import {
  applyPreferredOutput,
  createMicrophoneConstraints,
  friendlyMediaError,
  readAudioDevicePreferences,
} from "../lib/mediaDevices";
import {
  createRtcConfig,
  supportsScreenShare,
  supportsVideoCalls,
  supportsVoiceCalls,
} from "../lib/webrtc";
import { Icon } from "./Icon";
import type { VoiceOverlaySnapshot } from "../lib/voiceOverlay";
import "./DirectCallManager.css";

export type DirectVoiceOverlaySnapshot = VoiceOverlaySnapshot;

type DirectCallStatus = "ringing" | "active" | "declined" | "missed" | "cancelled" | "ended";
type MediaMode = "audio" | "video";

type DirectCall = {
  id: string;
  caller_id: string;
  callee_id: string;
  status: DirectCallStatus;
  media_mode: MediaMode;
  started_at: string;
  expires_at: string;
  answered_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
  other_user_id: string;
  other_display_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  recipient_online_at_start: boolean;
  feedback_submitted: boolean;
};

type DirectCallSignal = {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice" | "leave";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type DirectMediaState = {
  user_id?: string;
  muted?: boolean;
  camera?: boolean;
  screen?: boolean;
};

type StartCallDetail = {
  userId: string;
  mode?: MediaMode;
  requestId?: string;
};

type Props = {
  session: Session | null;
  squadVoiceActive: boolean;
  onOpenMessages: (userId: string) => void;
  currentDisplayName: string;
  currentAvatarUrl: string | null;
  onOverlayStateChange?: (snapshot: DirectVoiceOverlaySnapshot | null) => void;
};

export default function DirectCallManager({ session, squadVoiceActive, onOpenMessages, currentDisplayName, currentAvatarUrl, onOverlayStateChange }: Props) {
  const [call, setCall] = useState<DirectCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteCameraEnabled, setRemoteCameraEnabled] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localAudioStream, setLocalAudioStream] = useState<MediaStream | null>(null);
  const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | "waiting">("waiting");
  const [elapsed, setElapsed] = useState(0);
  const [ringRemaining, setRingRemaining] = useState(30);
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [feedbackCall, setFeedbackCall] = useState<DirectCall | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const videoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const cameraEnabledRef = useRef(false);
  const screenSharingRef = useRef(false);
  const autoCameraRef = useRef(false);
  const callRef = useRef<DirectCall | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const nativeNotifiedCallRef = useRef<string | null>(null);

  const userId = session?.user.id ?? null;
  const otherName = call?.other_display_name || call?.other_username || "Joueur GameMate";
  const incoming = Boolean(call && userId && call.callee_id === userId);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    if (userId) void prepareNativeNotifications();
  }, [userId]);

  const stopMedia = useCallback(() => {
    if (disconnectTimerRef.current !== null) window.clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = null;
    if (channelRef.current) {
      void channelRef.current.untrack();
      void supabase.removeChannel(channelRef.current);
    }
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    audioTransceiverRef.current = null;
    videoTransceiverRef.current = null;
    pendingIceRef.current = [];
    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    cameraTrackRef.current = null;
    mutedRef.current = false;
    deafenedRef.current = false;
    cameraEnabledRef.current = false;
    screenSharingRef.current = false;
    autoCameraRef.current = false;
    setMuted(false);
    setDeafened(false);
    setCameraEnabled(false);
    setScreenSharing(false);
    setRemoteMuted(false);
    setRemoteCameraEnabled(false);
    setRemoteScreenSharing(false);
    setRemoteStream(null);
    setLocalAudioStream(null);
    setLocalPreviewStream(null);
    setConnectionState("waiting");
    setElapsed(0);
  }, []);

  const scheduleClear = useCallback((message: string) => {
    setNotice(message);
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => {
      setCall(null);
      setNotice("");
      clearTimerRef.current = null;
    }, 4200);
  }, []);

  const loadCall = useCallback(async (callId: string) => {
    const { data, error } = await supabase.rpc("get_direct_call_details_v19", {
      p_call_id: callId,
    });

    if (error || !data) {
      console.error("GameMate direct call details:", error);
      return;
    }

    const next = data as DirectCall;
    const skippedKey = `gamemate-call-feedback-skipped:${next.id}`;
    if (
      next.status === "ended"
      && next.answered_at
      && !next.feedback_submitted
      && sessionStorage.getItem(skippedKey) !== "true"
    ) {
      setFeedbackCall(next);
      setFeedbackRating(0);
      setFeedbackTags([]);
      setFeedbackComment("");
      setFeedbackError("");
    }
    callRef.current = next;
    setCall(next);
    window.dispatchEvent(new Event("gamemate:direct-call-history-changed"));

    if (next.status === "declined") {
      stopMedia();
      scheduleClear("Appel refusé");
    } else if (next.status === "missed") {
      stopMedia();
      scheduleClear(next.callee_id === userId ? "Appel manqué" : "Aucune réponse");
    } else if (next.status === "cancelled") {
      stopMedia();
      scheduleClear("Appel annulé");
    } else if (next.status === "ended") {
      stopMedia();
      scheduleClear("Appel terminé");
    }
  }, [scheduleClear, stopMedia, userId]);

  const prepareMicrophone = useCallback(async () => {
    const current = localStreamRef.current;
    if (current?.getAudioTracks().length) return current;
    if (!supportsVoiceCalls()) throw new Error("webrtc_unavailable");

    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: createMicrophoneConstraints(readAudioDevicePreferences()),
      video: false,
    });
    const stream = current ?? new MediaStream();
    microphone.getAudioTracks().forEach((track) => {
      track.enabled = !mutedRef.current;
      stream.addTrack(track);
    });
    localStreamRef.current = stream;
    setLocalAudioStream(new MediaStream(stream.getAudioTracks()));
    return stream;
  }, []);

  const sendBroadcast = useCallback((event: string, payload: unknown) => {
    if (!channelRef.current) return;
    void channelRef.current.send({ type: "broadcast", event, payload });
  }, []);

  const sendMediaState = useCallback(() => {
    if (!userId) return;
    sendBroadcast("direct-media-state", {
      user_id: userId,
      muted: mutedRef.current,
      camera: cameraEnabledRef.current,
      screen: screenSharingRef.current,
    } satisfies DirectMediaState);
  }, [sendBroadcast, userId]);

  const sendSignal = useCallback((signal: Omit<DirectCallSignal, "from">) => {
    if (!userId) return;
    sendBroadcast("direct-voice-signal", { ...signal, from: userId } satisfies DirectCallSignal);
  }, [sendBroadcast, userId]);

  const refreshLocalPreview = useCallback(() => {
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
    if (screenTrack && screenSharingRef.current) {
      setLocalPreviewStream(new MediaStream([screenTrack]));
      return;
    }
    const cameraTrack = cameraTrackRef.current;
    setLocalPreviewStream(cameraTrack && cameraEnabledRef.current ? new MediaStream([cameraTrack]) : null);
  }, []);

  const prepareCamera = useCallback(async () => {
    if (!supportsVideoCalls()) throw new Error("webrtc_unavailable");
    let track = cameraTrackRef.current;
    if (!track || track.readyState === "ended") {
      const camera = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
        },
      });
      track = camera.getVideoTracks()[0] ?? null;
      if (!track) throw new DOMException("Aucune caméra détectée", "NotFoundError");
      const stream = localStreamRef.current ?? new MediaStream();
      stream.getVideoTracks().forEach((oldTrack) => {
        stream.removeTrack(oldTrack);
        oldTrack.stop();
      });
      stream.addTrack(track);
      localStreamRef.current = stream;
      cameraTrackRef.current = track;
    }
    cameraEnabledRef.current = true;
    setCameraEnabled(true);
    if (!screenSharingRef.current) await videoTransceiverRef.current?.sender.replaceTrack(track);
    refreshLocalPreview();
    sendMediaState();
    return track;
  }, [refreshLocalPreview, sendMediaState]);

  const prepareLocalMedia = useCallback(async (withCamera: boolean) => {
    await prepareMicrophone();
    if (!withCamera) return;
    try {
      await prepareCamera();
    } catch (error) {
      console.error("GameMate camera:", error);
      setNotice(friendlyVideoError(error));
    }
  }, [prepareCamera, prepareMicrophone]);

  const ensurePeer = useCallback((activeCall: DirectCall) => {
    if (peerRef.current) return peerRef.current;

    const peer = new RTCPeerConnection(createRtcConfig());
    const stream = localStreamRef.current;
    const audioTrack = stream?.getAudioTracks()[0];
    const videoTrack = screenStreamRef.current?.getVideoTracks()[0]
      ?? (cameraEnabledRef.current ? cameraTrackRef.current : null);

    audioTransceiverRef.current = peer.addTransceiver(audioTrack ?? "audio", {
      direction: "sendrecv",
      ...(audioTrack && stream ? { streams: [stream] } : {}),
    });
    videoTransceiverRef.current = peer.addTransceiver(videoTrack ?? "video", {
      direction: "sendrecv",
      ...(videoTrack && stream ? { streams: [stream] } : {}),
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal({
        to: activeCall.other_user_id,
        kind: "ice",
        candidate: event.candidate.toJSON(),
      });
    };

    peer.ontrack = (event) => {
      const combined = remoteStreamRef.current ?? new MediaStream();
      if (!combined.getTracks().some((track) => track.id === event.track.id)) combined.addTrack(event.track);
      remoteStreamRef.current = combined;
      setRemoteStream(new MediaStream(combined.getTracks()));
      event.track.onended = () => {
        combined.removeTrack(event.track);
        setRemoteStream(combined.getTracks().length ? new MediaStream(combined.getTracks()) : null);
      };
    };

    peer.onconnectionstatechange = () => {
      setConnectionState(peer.connectionState);
      if (peer.connectionState === "disconnected") {
        if (disconnectTimerRef.current !== null) window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = window.setTimeout(() => {
          if (peer.connectionState === "disconnected") setNotice("Connexion à l’appel interrompue");
        }, 8000);
      } else if (peer.connectionState === "failed") {
        setNotice("Connexion à l’appel impossible");
        void supabase.rpc("end_direct_call_v16", { p_call_id: activeCall.id });
      } else if (peer.connectionState === "connected" && disconnectTimerRef.current !== null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    };

    peerRef.current = peer;
    return peer;
  }, [sendSignal]);

  const flushPendingIce = useCallback(async (peer: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (error) {
        console.error("GameMate direct call ICE:", error);
      }
    }
  }, []);

  const createOffer = useCallback(async (activeCall: DirectCall) => {
    const peer = ensurePeer(activeCall);
    if (peer.signalingState !== "stable" || peer.localDescription) return;
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal({
        to: activeCall.other_user_id,
        kind: "offer",
        description: { type: offer.type, sdp: offer.sdp },
      });
    } catch (error) {
      console.error("GameMate direct call offer:", error);
      setNotice("La liaison de l’appel n’a pas pu être créée");
    }
  }, [ensurePeer, sendSignal]);

  const handleSignal = useCallback(async (signal: DirectCallSignal) => {
    const activeCall = callRef.current;
    if (!activeCall || !userId || signal.to !== userId || signal.from !== activeCall.other_user_id) return;

    if (signal.kind === "leave") {
      setNotice("Ton ami a quitté l’appel");
      return;
    }

    const peer = ensurePeer(activeCall);
    try {
      if (signal.kind === "offer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        await flushPendingIce(peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({
          to: signal.from,
          kind: "answer",
          description: { type: answer.type, sdp: answer.sdp },
        });
      } else if (signal.kind === "answer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        await flushPendingIce(peer);
      } else if (signal.kind === "ice" && signal.candidate) {
        if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
        else pendingIceRef.current = [...pendingIceRef.current, signal.candidate];
      }
    } catch (error) {
      console.error("GameMate direct call signal:", error);
      setNotice("Erreur pendant la négociation de l’appel");
    }
  }, [ensurePeer, flushPendingIce, sendSignal, userId]);

  const connectMedia = useCallback(async (activeCall: DirectCall, withCamera = autoCameraRef.current) => {
    if (!userId || channelRef.current) return;

    try {
      await prepareLocalMedia(withCamera);
      const channel = supabase.channel(`direct-call:${activeCall.id}`, {
        config: {
          private: true,
          presence: { key: userId },
          broadcast: { self: false },
        },
      } as Parameters<typeof supabase.channel>[1]);
      channelRef.current = channel;

      channel
        .on("broadcast", { event: "direct-voice-signal" }, ({ payload }: { payload: unknown }) => {
          void handleSignal(payload as DirectCallSignal);
        })
        .on("broadcast", { event: "direct-media-state" }, ({ payload }: { payload: unknown }) => {
          const state = payload as DirectMediaState;
          if (state.user_id !== activeCall.other_user_id) return;
          if (typeof state.muted === "boolean") setRemoteMuted(state.muted);
          if (typeof state.camera === "boolean") setRemoteCameraEnabled(state.camera);
          if (typeof state.screen === "boolean") setRemoteScreenSharing(state.screen);
        })
        .on("broadcast", { event: "direct-voice-state" }, ({ payload }: { payload: unknown }) => {
          const state = payload as DirectMediaState;
          if (state.user_id === activeCall.other_user_id && typeof state.muted === "boolean") {
            setRemoteMuted(state.muted);
          }
        })
        .on("presence", { event: "sync" }, () => {
          const presence = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
          const present = new Set(Object.values(presence).flat().map((entry) => entry.user_id).filter(Boolean));
          if (!present.has(activeCall.other_user_id)) return;
          sendMediaState();
          if (activeCall.caller_id === userId) void createOffer(activeCall);
        })
        .subscribe(async (status, error) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ user_id: userId, joined_at: new Date().toISOString() });
            sendMediaState();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("GameMate direct call channel:", error);
            setNotice("Connexion privée à l’appel impossible");
          }
        });
    } catch (error) {
      setNotice(error instanceof Error && error.message === "webrtc_unavailable"
        ? "Les appels ne sont pas disponibles sur cette version de Windows"
        : friendlyMediaError(error));
    }
  }, [createOffer, handleSignal, prepareLocalMedia, sendMediaState, userId]);

  const requestSquadVoiceExit = useCallback(() => {
    if (!squadVoiceActive) return;
    window.dispatchEvent(new CustomEvent("gamemate:voice-command", { detail: { action: "leave" } }));
  }, [squadVoiceActive]);

  const startCall = useCallback(async (calleeId: string, mode: MediaMode = "audio") => {
    if (!userId) {
      setNotice("Reconnecte-toi à GameMate avant de lancer un appel");
      return;
    }
    if (busy) {
      setNotice("Un appel est déjà en préparation…");
      return;
    }
    if (callRef.current?.status === "ringing" || callRef.current?.status === "active") {
      setNotice("Termine l’appel en cours avant d’en lancer un autre");
      return;
    }

    setBusy(true);
    setNotice(mode === "video" ? "Préparation de l’appel vidéo…" : "Préparation de l’appel…");
    autoCameraRef.current = mode === "video";
    console.info("[GameMate calls] start requested", { calleeId, mode });
    try {
      const { data, error } = await supabase.rpc("start_direct_call_v19", {
        p_callee_id: calleeId,
        p_media_mode: mode,
      });

      if (error || !data) {
        console.error("GameMate start direct call:", error);
        setNotice(callError(error?.message));
        return;
      }

      console.info("[GameMate calls] start accepted", { callId: (data as { id: string }).id });
      requestSquadVoiceExit();
      await loadCall((data as { id: string }).id);
    } catch (error) {
      console.error("GameMate start direct call / unexpected:", error);
      setNotice("La demande d’appel a échoué. Vérifie ta connexion puis réessaie.");
    } finally {
      setBusy(false);
    }
  }, [busy, loadCall, requestSquadVoiceExit, userId]);

  const answerCall = useCallback(async (withCamera: boolean) => {
    if (!call || busy) return;
    setBusy(true);
    setNotice("");
    autoCameraRef.current = withCamera;
    try {
      await prepareLocalMedia(withCamera);
      requestSquadVoiceExit();
      const { data, error } = await supabase.rpc("respond_direct_call_v16", {
        p_call_id: call.id,
        p_accept: true,
      });
      if (error || !data) throw error ?? new Error("call_not_found");
      const status = (data as { status: DirectCallStatus }).status;
      if (status !== "active") {
        await loadCall(call.id);
      } else {
        const activeCall: DirectCall = { ...call, status: "active", answered_at: new Date().toISOString() };
        callRef.current = activeCall;
        setCall(activeCall);
        await connectMedia(activeCall, withCamera);
      }
    } catch (error) {
      stopMedia();
      setNotice(error instanceof DOMException
        ? friendlyMediaError(error)
        : callError((error as { message?: string } | null)?.message));
    } finally {
      setBusy(false);
    }
  }, [busy, call, connectMedia, loadCall, prepareLocalMedia, requestSquadVoiceExit, stopMedia]);

  const declineCall = useCallback(async () => {
    if (!call || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("respond_direct_call_v16", {
      p_call_id: call.id,
      p_accept: false,
    });
    setBusy(false);
    if (error) setNotice(callError(error.message));
    else await loadCall(call.id);
  }, [busy, call, loadCall]);

  const endCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall || busy) return;
    setBusy(true);
    sendSignal({ to: activeCall.other_user_id, kind: "leave" });
    const { error } = await supabase.rpc("end_direct_call_v16", {
      p_call_id: activeCall.id,
    });
    setBusy(false);
    if (error) setNotice(callError(error.message));
    else await loadCall(activeCall.id);
  }, [busy, loadCall, sendSignal]);

  const dismissFeedback = useCallback(() => {
    if (feedbackCall) sessionStorage.setItem(`gamemate-call-feedback-skipped:${feedbackCall.id}`, "true");
    setFeedbackCall(null);
    setFeedbackError("");
  }, [feedbackCall]);

  const toggleFeedbackTag = useCallback((tag: string) => {
    setFeedbackTags((current) => current.includes(tag)
      ? current.filter((value) => value !== tag)
      : [...current, tag]);
  }, []);

  const submitFeedback = useCallback(async () => {
    if (!feedbackCall || feedbackRating < 1 || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackError("");
    const { error } = await supabase.rpc("submit_direct_call_feedback_v19", {
      p_call_id: feedbackCall.id,
      p_rating: feedbackRating,
      p_issue_tags: feedbackTags,
      p_comment: feedbackComment.trim() || null,
    });
    setFeedbackBusy(false);

    if (error) {
      console.error("GameMate call feedback:", error);
      setFeedbackError("Ton avis n’a pas pu être envoyé. Réessaie dans un instant.");
      return;
    }

    setFeedbackCall(null);
    setNotice("Merci, ton avis nous aide à améliorer les appels GameMate.");
  }, [feedbackBusy, feedbackCall, feedbackComment, feedbackRating, feedbackTags]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    sendBroadcast("direct-voice-state", { user_id: userId, muted: next });
    sendMediaState();
  }, [sendBroadcast, sendMediaState, userId]);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
  }, []);

  const localSpeaking = useSpeakingActivity(localAudioStream, Boolean(call?.status === "active" && !muted));
  const remoteSpeaking = useSpeakingActivity(remoteStream, Boolean(call?.status === "active" && !remoteMuted));

  useEffect(() => {
    if (!call || call.status !== "active") {
      onOverlayStateChange?.(null);
      return;
    }

    onOverlayStateChange?.({
      kind: "direct",
      title: `Appel avec ${otherName}`,
      participants: [
        {
          id: userId ?? "self",
          name: currentDisplayName,
          avatarUrl: currentAvatarUrl,
          muted,
          speaking: localSpeaking,
          self: true,
        },
        {
          id: call.other_user_id,
          name: otherName,
          avatarUrl: call.other_avatar_url,
          muted: remoteMuted,
          speaking: remoteSpeaking,
          self: false,
        },
      ],
    });
  }, [call, currentAvatarUrl, currentDisplayName, localSpeaking, muted, onOverlayStateChange, otherName, remoteMuted, remoteSpeaking, userId]);

  useEffect(() => {
    const handleGlobalVoiceCommand = (event: Event) => {
      if (callRef.current?.status !== "active") return;
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "toggle-mute") toggleMute();
      if (action === "toggle-deafen") toggleDeafen();
    };
    window.addEventListener("gamemate:global-voice-command", handleGlobalVoiceCommand);
    return () => window.removeEventListener("gamemate:global-voice-command", handleGlobalVoiceCommand);
  }, [toggleDeafen, toggleMute]);

  const toggleCamera = useCallback(async () => {
    if (mediaBusy) return;
    setMediaBusy(true);
    try {
      const track = cameraTrackRef.current;
      if (!track || track.readyState === "ended") {
        await prepareCamera();
      } else {
        const next = !cameraEnabledRef.current;
        track.enabled = next;
        cameraEnabledRef.current = next;
        setCameraEnabled(next);
        if (!screenSharingRef.current) await videoTransceiverRef.current?.sender.replaceTrack(next ? track : null);
        refreshLocalPreview();
        sendMediaState();
      }
    } catch (error) {
      setNotice(friendlyVideoError(error));
    } finally {
      setMediaBusy(false);
    }
  }, [mediaBusy, prepareCamera, refreshLocalPreview, sendMediaState]);

  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current;
    screenStreamRef.current = null;
    screenSharingRef.current = false;
    setScreenSharing(false);
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    const cameraTrack = cameraEnabledRef.current ? cameraTrackRef.current : null;
    await videoTransceiverRef.current?.sender.replaceTrack(cameraTrack);
    refreshLocalPreview();
    sendMediaState();
  }, [refreshLocalPreview, sendMediaState]);

  const startScreenShare = useCallback(async () => {
    if (mediaBusy || !supportsScreenShare()) return;
    setMediaBusy(true);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
      const track = display.getVideoTracks()[0];
      if (!track) throw new DOMException("Aucun écran sélectionné", "NotFoundError");
      screenStreamRef.current?.getTracks().forEach((oldTrack) => oldTrack.stop());
      screenStreamRef.current = display;
      screenSharingRef.current = true;
      setScreenSharing(true);
      await videoTransceiverRef.current?.sender.replaceTrack(track);
      track.onended = () => { void stopScreenShare(); };
      refreshLocalPreview();
      sendMediaState();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        setNotice(friendlyScreenError(error));
      }
    } finally {
      setMediaBusy(false);
    }
  }, [mediaBusy, refreshLocalPreview, sendMediaState, stopScreenShare]);

  useEffect(() => {
    const onStartCall = (event: Event) => {
      const detail = (event as CustomEvent<StartCallDetail>).detail;
      if (!detail?.userId) return;
      window.dispatchEvent(new CustomEvent("gamemate:direct-call-ack", {
        detail: { requestId: detail.requestId },
      }));
      void startCall(detail.userId, detail.mode ?? "audio");
    };
    window.addEventListener("gamemate:start-direct-call", onStartCall);
    return () => window.removeEventListener("gamemate:start-direct-call", onStartCall);
  }, [startCall]);

  useEffect(() => {
    if (!userId) {
      const timer = window.setTimeout(() => {
        stopMedia();
        setCall(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    const refreshFromChange = (payload: { new?: unknown; old?: unknown }) => {
      const row = (payload.new || payload.old) as { id?: string };
      if (row.id) void loadCall(row.id);
    };

    async function restoreOpenCall() {
      await supabase.rpc("expire_my_direct_calls_v16");
      const { data } = await supabase
        .from("direct_calls")
        .select("id, status, started_at")
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .in("status", ["ringing", "active"])
        .order("started_at", { ascending: false })
        .limit(1);
      if (active && data?.[0]?.id) await loadCall(data[0].id);
    }

    void restoreOpenCall();

    const callerChannel = supabase
      .channel(`direct-call-caller:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "direct_calls", filter: `caller_id=eq.${userId}`,
      }, refreshFromChange)
      .subscribe();
    const calleeChannel = supabase
      .channel(`direct-call-callee:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "direct_calls", filter: `callee_id=eq.${userId}`,
      }, refreshFromChange)
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(callerChannel);
      void supabase.removeChannel(calleeChannel);
    };
  }, [loadCall, stopMedia, userId]);

  useEffect(() => {
    if (!call || call.status !== "ringing") return;
    const delay = Math.max(0, new Date(call.expires_at).getTime() - Date.now());
    const updateCountdown = () => {
      setRingRemaining(Math.max(0, Math.ceil((new Date(call.expires_at).getTime() - Date.now()) / 1000)));
    };
    updateCountdown();
    const countdown = window.setInterval(updateCountdown, 500);
    const timer = window.setTimeout(async () => {
      await supabase.rpc("expire_my_direct_calls_v16");
      await loadCall(call.id);
    }, delay + 250);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(countdown);
    };
  }, [call, loadCall]);

  useEffect(() => {
    if (!call || call.status !== "ringing" || !incoming) return;
    playNotificationSound();
    const ring = window.setInterval(playNotificationSound, 4200);
    return () => window.clearInterval(ring);
  }, [call, incoming]);

  useEffect(() => {
    if (!call || call.status !== "ringing" || !incoming) return;
    if (nativeNotifiedCallRef.current === call.id) return;
    nativeNotifiedCallRef.current = call.id;
    void showIncomingCallNotification({ callerName: otherName, mode: call.media_mode });
  }, [call, incoming, otherName]);

  useEffect(() => {
    if (!call || call.status !== "ringing" || incoming) return;
    const online = call.recipient_online_at_start;
    playOutgoingCallTone(online);
    const ring = window.setInterval(
      () => playOutgoingCallTone(online),
      online ? 3200 : 5200
    );
    return () => window.clearInterval(ring);
  }, [call, incoming]);

  useEffect(() => {
    if (!call || call.status !== "active") return;
    void connectMedia(call);
    const origin = call.answered_at ? new Date(call.answered_at).getTime() : Date.now();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [call, connectMedia]);

  useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    stopMedia();
  }, [stopMedia]);

  useEffect(() => {
    if (call || !notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [call, notice]);

  const feedbackLayer = feedbackCall ? (
    <CallFeedbackModal
      call={feedbackCall}
      rating={feedbackRating}
      tags={feedbackTags}
      comment={feedbackComment}
      busy={feedbackBusy}
      error={feedbackError}
      onRating={setFeedbackRating}
      onToggleTag={toggleFeedbackTag}
      onComment={setFeedbackComment}
      onSubmit={() => void submitFeedback()}
      onDismiss={dismissFeedback}
    />
  ) : null;

  if (!call && !notice && !feedbackLayer) return null;

  if (!call) {
    return (
      <>
        {notice ? <div className="dc18-toast"><Icon name="phone" size={17} /><span>{notice}</span></div> : null}
        {feedbackLayer}
      </>
    );
  }

  const terminal = !["ringing", "active"].includes(call.status);
  const isVideoCall = call.media_mode === "video";
  const showStage = call.status === "active" && (
    isVideoCall || cameraEnabled || screenSharing || remoteCameraEnabled || remoteScreenSharing
  );
  const remoteVideoVisible = remoteCameraEnabled || remoteScreenSharing;

  return (
    <>
    <aside className={`dc18 ${call.status} ${incoming ? "incoming" : "outgoing"} ${showStage ? "with-stage" : ""}`} aria-live="polite">
      {showStage ? (
        <div className="dc18-stage">
          <DirectRemoteMedia stream={remoteStream} muted={deafened} video />
          {!remoteVideoVisible ? (
            <div className="dc18-stage-placeholder">
              <span className="dc18-stage-avatar">
                {call.other_avatar_url ? <img src={call.other_avatar_url} alt="" /> : otherName.slice(0, 1).toUpperCase()}
              </span>
              <strong>{otherName}</strong>
              <small>{connectionState === "connected" ? "Caméra désactivée" : "Connexion en cours…"}</small>
            </div>
          ) : null}
          {remoteScreenSharing ? <span className="dc18-stage-badge"><Icon name="screen-share" size={13} /> Écran partagé</span> : null}
          {localPreviewStream ? <LocalPreview stream={localPreviewStream} sharing={screenSharing} /> : null}
        </div>
      ) : null}

      <div className="dc18-bar">
        <button type="button" className="dc18-person" onClick={() => onOpenMessages(call.other_user_id)}>
          <span className="dc18-avatar">
            {call.other_avatar_url ? <img src={call.other_avatar_url} alt="" /> : otherName.slice(0, 1).toUpperCase()}
            <i className={!incoming && call.status === "ringing" && !call.recipient_online_at_start ? "offline" : ""} />
          </span>
          <span className="dc18-copy">
            <small>{callHeader(call, incoming)}</small>
            <strong>{otherName}</strong>
            <em>{call.status === "active"
              ? `${connectionLabel(connectionState)} · ${formatDuration(elapsed)}`
              : call.status === "ringing"
                ? incoming
                  ? `Expire dans ${formatDuration(ringRemaining)}`
                  : call.recipient_online_at_start
                    ? `Sonnerie… · ${formatDuration(ringRemaining)}`
                    : `Hors ligne · notification envoyée · ${formatDuration(ringRemaining)}`
                : notice || callStatusLabel(call.status)}</em>
          </span>
        </button>

        {remoteMuted && call.status === "active" ? <span className="dc18-remote-muted" title="Micro distant coupé"><Icon name="mic-off" size={14} /></span> : null}

        <div className="dc18-actions">
          {call.status === "ringing" && incoming ? (
            <>
              {isVideoCall ? (
                <button type="button" className="accept video" disabled={busy} onClick={() => void answerCall(true)} aria-label="Accepter avec la caméra"><Icon name="video" /></button>
              ) : null}
              <button type="button" className="accept" disabled={busy} onClick={() => void answerCall(false)} aria-label={isVideoCall ? "Accepter sans caméra" : "Accepter l’appel"}><Icon name="phone" /></button>
              <button type="button" className="hangup" disabled={busy} onClick={() => void declineCall()} aria-label="Refuser l’appel"><Icon name="phone-off" /></button>
            </>
          ) : call.status === "ringing" ? (
            <button type="button" className="hangup" disabled={busy} onClick={() => void endCall()} aria-label="Annuler l’appel"><Icon name="phone-off" /></button>
          ) : call.status === "active" ? (
            <>
              <button type="button" className={muted ? "active" : ""} onClick={toggleMute} aria-label={muted ? "Réactiver le microphone" : "Couper le microphone"}><Icon name={muted ? "mic-off" : "mic"} /></button>
              <button type="button" className={deafened ? "active" : ""} onClick={toggleDeafen} aria-label={deafened ? "Réactiver le son" : "Couper le son"}><Icon name={deafened ? "volume-x" : "headphones"} /></button>
              {supportsVideoCalls() ? <button type="button" disabled={mediaBusy} className={cameraEnabled ? "enabled" : ""} onClick={() => void toggleCamera()} aria-label={cameraEnabled ? "Couper la caméra" : "Activer la caméra"}><Icon name={cameraEnabled ? "video" : "video-off"} /></button> : null}
              {supportsScreenShare() ? <button type="button" disabled={mediaBusy} className={screenSharing ? "enabled screen" : ""} onClick={() => void (screenSharing ? stopScreenShare() : startScreenShare())} aria-label={screenSharing ? "Arrêter le partage d’écran" : "Partager un écran ou une fenêtre"}><Icon name={screenSharing ? "screen-share-off" : "screen-share"} /></button> : null}
              <button type="button" className="hangup" disabled={busy} onClick={() => void endCall()} aria-label="Raccrocher"><Icon name="phone-off" /></button>
            </>
          ) : terminal ? null : null}
        </div>
      </div>

      {notice && call.status === "active" ? <div className="dc18-notice">{notice}</div> : null}
      {!showStage && remoteStream ? <DirectRemoteMedia stream={remoteStream} muted={deafened} video={false} /> : null}
    </aside>
    {feedbackLayer}
    </>
  );
}

function useSpeakingActivity(stream: MediaStream | null, enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return undefined;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.68;
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let lastSpeaking = false;
    let lastChange = 0;

    const measure = (timestamp: number) => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      const nextSpeaking = Math.sqrt(energy / samples.length) > 0.035;
      if (nextSpeaking !== lastSpeaking && timestamp - lastChange > 220) {
        lastSpeaking = nextSpeaking;
        lastChange = timestamp;
        setSpeaking(nextSpeaking);
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
      setSpeaking(false);
    };
  }, [enabled, stream]);

  return speaking;
}

function DirectRemoteMedia({ stream, muted, video }: { stream: MediaStream | null; muted: boolean; video: boolean }) {
  const ref = useRef<HTMLMediaElement | null>(null);

  useEffect(() => {
    const media = ref.current;
    if (!media || !stream) return undefined;
    media.srcObject = stream;
    void applyPreferredOutput(media).then(() => media.play()).catch(() => undefined);
    const updateOutput = () => void applyPreferredOutput(media).catch(() => undefined);
    window.addEventListener("gamemate-audio-devices-changed", updateOutput);
    return () => {
      window.removeEventListener("gamemate-audio-devices-changed", updateOutput);
      media.pause();
      media.srcObject = null;
    };
  }, [stream, video]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  return video
    ? <video ref={(node) => { ref.current = node; }} className="dc18-remote-video" autoPlay playsInline />
    : <audio ref={(node) => { ref.current = node; }} autoPlay />;
}

function LocalPreview({ stream, sharing }: { stream: MediaStream; sharing: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <div className="dc18-local-preview">
      <video ref={ref} autoPlay muted playsInline />
      <span>{sharing ? "Ton écran" : "Toi"}</span>
    </div>
  );
}

const FEEDBACK_TAGS = [
  ["audio", "Son"],
  ["video", "Vidéo"],
  ["connection", "Connexion"],
  ["delay", "Décalage"],
  ["screen_share", "Partage d’écran"],
  ["notification", "Notification"],
] as const;

function CallFeedbackModal({
  call,
  rating,
  tags,
  comment,
  busy,
  error,
  onRating,
  onToggleTag,
  onComment,
  onSubmit,
  onDismiss,
}: {
  call: DirectCall;
  rating: number;
  tags: string[];
  comment: string;
  busy: boolean;
  error: string;
  onRating: (rating: number) => void;
  onToggleTag: (tag: string) => void;
  onComment: (comment: string) => void;
  onSubmit: () => void;
  onDismiss: () => void;
}) {
  const name = call.other_display_name || call.other_username || "Joueur GameMate";
  const duration = call.answered_at && call.ended_at
    ? Math.max(0, Math.floor((new Date(call.ended_at).getTime() - new Date(call.answered_at).getTime()) / 1000))
    : 0;

  return (
    <div className="dc19-feedback-backdrop" role="presentation">
      <section className="dc19-feedback" role="dialog" aria-modal="true" aria-labelledby="dc19-feedback-title">
        <button type="button" className="dc19-feedback-close" onClick={onDismiss} aria-label="Fermer"><Icon name="close" size={17} /></button>
        <div className="dc19-feedback-icon"><Icon name={call.media_mode === "video" ? "video" : "phone"} size={22} /></div>
        <span className="dc19-feedback-kicker">QUALITÉ DE L’APPEL</span>
        <h2 id="dc19-feedback-title">Comment s’est passé l’appel&nbsp;?</h2>
        <p>Avec {name} · {formatDuration(duration)}</p>

        <div className="dc19-stars" role="radiogroup" aria-label="Note de l’appel">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
              className={value <= rating ? "active" : ""}
              onClick={() => onRating(value)}
            >
              <Icon name="star" size={28} />
            </button>
          ))}
        </div>

        <div className="dc19-feedback-tags" aria-label="Problèmes rencontrés">
          {FEEDBACK_TAGS.map(([tag, label]) => (
            <button
              key={tag}
              type="button"
              className={tags.includes(tag) ? "active" : ""}
              aria-pressed={tags.includes(tag)}
              onClick={() => onToggleTag(tag)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="dc19-feedback-comment">
          <span>Un détail à nous partager ? <small>Facultatif</small></span>
          <textarea
            value={comment}
            maxLength={500}
            rows={3}
            placeholder="Son coupé, image saccadée, connexion lente…"
            onChange={(event) => onComment(event.target.value)}
          />
          <small>{comment.length}/500</small>
        </label>

        {error ? <div className="dc19-feedback-error">{error}</div> : null}
        <div className="dc19-feedback-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onDismiss}>Plus tard</button>
          <button type="button" className="primary" disabled={busy || rating < 1} onClick={onSubmit}>
            {busy ? "Envoi…" : "Envoyer mon avis"}
          </button>
        </div>
      </section>
    </div>
  );
}

function callHeader(call: DirectCall, incoming: boolean) {
  if (call.status === "ringing") {
    if (incoming) return call.media_mode === "video" ? "APPEL VIDÉO ENTRANT" : "APPEL VOCAL ENTRANT";
    return call.media_mode === "video" ? "APPEL VIDÉO EN COURS…" : "APPEL EN COURS…";
  }
  if (call.status === "active") return call.media_mode === "video" ? "APPEL VIDÉO PRIVÉ" : "APPEL VOCAL PRIVÉ";
  return "APPEL";
}

function friendlyVideoError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Accès à la caméra refusé dans les paramètres Windows";
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return "Aucune caméra compatible n’a été détectée";
    if (error.name === "NotReadableError" || error.name === "TrackStartError") return "La caméra est déjà utilisée ou indisponible";
  }
  return "La caméra n’a pas pu être activée";
}

function friendlyScreenError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotReadableError") return "Cet écran ne peut pas être partagé pour le moment";
  return "Le partage d’écran n’a pas pu démarrer";
}

function callError(message?: string) {
  if (!message) return "Impossible de lancer cet appel";
  if (message.includes("direct_calls_disabled")) return "Cet ami n’accepte pas les appels privés";
  if (message.includes("invalid_media_mode")) return "Ce type d’appel n’est pas disponible";
  if (message.includes("recipient_busy")) return "Cet ami est déjà en appel";
  if (message.includes("already_in_call")) return "Tu as déjà un appel en cours";
  if (message.includes("recipient_not_friend")) return "Les appels privés sont réservés aux amis";
  if (message.includes("user_blocked")) return "Cet appel est impossible";
  if (message.includes("call_not_found") || message.includes("call_expired")) return "Cet appel n’est plus disponible";
  return "L’appel n’a pas pu être établi";
}

function callStatusLabel(status: DirectCallStatus) {
  if (status === "active") return "Connecté";
  if (status === "declined") return "Appel refusé";
  if (status === "missed") return "Appel manqué";
  if (status === "cancelled") return "Appel annulé";
  if (status === "ended") return "Appel terminé";
  return "Sonnerie…";
}

function connectionLabel(state: RTCPeerConnectionState | "waiting") {
  if (state === "connected") return "Connecté";
  if (state === "failed") return "Connexion impossible";
  if (state === "disconnected") return "Reconnexion";
  return "Connexion…";
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
