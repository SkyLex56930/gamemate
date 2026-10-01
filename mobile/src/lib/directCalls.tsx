import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import type { MediaStream, RTCPeerConnection } from "react-native-webrtc";
import { Avatar } from "../components/Avatar";
import { supabase } from "./supabase";
import { theme } from "../theme/theme";

type CallStatus = "ringing" | "active" | "declined" | "missed" | "cancelled" | "ended";
type DirectCall = {
  id: string; caller_id: string; callee_id: string; status: CallStatus;
  media_mode?: "audio" | "video"; started_at: string; expires_at: string;
  other_user_id?: string; other_display_name?: string | null;
  other_username?: string | null; other_avatar_url?: string | null;
};
type Signal = { from: string; to: string; kind: "offer" | "answer" | "ice" | "leave";
  description?: { type: string | null; sdp: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };
type RtcApi = typeof import("react-native-webrtc");

type DirectCallsContextValue = {
  startCall: (userId: string) => Promise<void>;
  busy: boolean;
};

const DirectCallsContext = createContext<DirectCallsContextValue | null>(null);

function callError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("recipient_busy")) return "Ce joueur est déjà en appel.";
  if (message.includes("direct_calls_disabled")) return "Ce joueur n’accepte pas les appels privés.";
  if (message.includes("recipient_not_friend")) return "Les appels sont réservés aux amis.";
  if (message.includes("already_in_call")) return "Tu es déjà dans un appel.";
  return "L’appel n’a pas pu démarrer.";
}

export function DirectCallsProvider({ session, children }: { session: Session; children: ReactNode }) {
  const userId = session.user.id;
  const [call, setCall] = useState<DirectCall | null>(null);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const callRef = useRef<DirectCall | null>(null);
  const rtcRef = useRef<RtcApi | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const queuedIce = useRef<NonNullable<Signal["candidate"]>[]>([]);
  const connectingRef = useRef(false);

  useEffect(() => { callRef.current = call; }, [call]);

  const releaseMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    queuedIce.current = [];
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    rtcRef.current = null;
    connectingRef.current = false;
    setMuted(false);
  }, []);

  const loadDetails = useCallback(async (callId: string) => {
    const { data, error: detailsError } = await supabase.rpc("get_direct_call_details_v18", { p_call_id: callId });
    if (detailsError || !data) return null;
    return data as DirectCall;
  }, []);

  const sendSignal = useCallback((signal: Omit<Signal, "from">) => {
    void channelRef.current?.send({ type: "broadcast", event: "direct-voice-signal",
      payload: { ...signal, from: userId } satisfies Signal });
  }, [userId]);

  const ensurePeer = useCallback((activeCall: DirectCall) => {
    if (peerRef.current || !rtcRef.current || !streamRef.current) return peerRef.current;
    const peer = new rtcRef.current.RTCPeerConnection({ iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      ...(process.env.EXPO_PUBLIC_WEBRTC_TURN_URLS ? [{
        urls: process.env.EXPO_PUBLIC_WEBRTC_TURN_URLS.split(",").map((url: string) => url.trim()).filter(Boolean),
        username: process.env.EXPO_PUBLIC_WEBRTC_TURN_USERNAME,
        credential: process.env.EXPO_PUBLIC_WEBRTC_TURN_CREDENTIAL,
      }] : []),
    ] });
    streamRef.current.getTracks().forEach((track) => peer.addTrack(track, streamRef.current!));
    peer.onicecandidate = (event: { candidate: { toJSON: () => NonNullable<Signal["candidate"]> } | null }) => {
      if (event.candidate) sendSignal({ to: activeCall.caller_id === userId ? activeCall.callee_id : activeCall.caller_id,
        kind: "ice", candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") setError("La connexion audio a été interrompue.");
    };
    peerRef.current = peer;
    return peer;
  }, [sendSignal, userId]);

  const handleSignal = useCallback(async (signal: Signal) => {
    const activeCall = callRef.current;
    if (!activeCall || signal.from === userId || (signal.to !== userId && signal.to !== "*")) return;
    if (signal.kind === "leave") { releaseMedia(); return; }
    const peer = ensurePeer(activeCall);
    if (!peer) return;
    try {
      if (signal.kind === "offer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        for (const candidate of queuedIce.current.splice(0)) await peer.addIceCandidate(candidate);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({ to: signal.from, kind: "answer", description: { type: answer.type, sdp: answer.sdp } });
      } else if (signal.kind === "answer" && signal.description) {
        await peer.setRemoteDescription(signal.description);
        for (const candidate of queuedIce.current.splice(0)) await peer.addIceCandidate(candidate);
      } else if (signal.kind === "ice" && signal.candidate) {
        if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
        else queuedIce.current.push(signal.candidate);
      }
    } catch (cause) {
      console.error("Appel mobile / signal :", cause);
      setError("La connexion audio a rencontré une erreur.");
    }
  }, [ensurePeer, releaseMedia, sendSignal, userId]);

  const connectMedia = useCallback(async (activeCall: DirectCall) => {
    if (connectingRef.current || streamRef.current) return;
    connectingRef.current = true;
    try {
      const rtc = await import("react-native-webrtc");
      const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
      rtcRef.current = rtc;
      streamRef.current = stream;
      const peer = ensurePeer(activeCall);
      const channel = supabase.channel(`direct-call:${activeCall.id}`, { config: { private: true,
        broadcast: { self: false }, presence: { key: userId } } });
      channelRef.current = channel;
      channel.on("broadcast", { event: "direct-voice-signal" }, ({ payload }) => void handleSignal(payload as Signal));
      await new Promise<void>((resolve, reject) => channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
      }));
      await channel.track({ user_id: userId, muted: false, joined_at: new Date().toISOString() });
      if (activeCall.caller_id === userId && peer) {
        const offer = await peer.createOffer({ offerToReceiveAudio: true });
        await peer.setLocalDescription(offer);
        sendSignal({ to: activeCall.callee_id, kind: "offer", description: { type: offer.type, sdp: offer.sdp } });
      }
    } catch (cause) {
      console.error("Appel mobile / média :", cause);
      releaseMedia();
      setError("Autorise le microphone puis réessaie.");
    } finally {
      connectingRef.current = false;
    }
  }, [ensurePeer, handleSignal, releaseMedia, sendSignal, userId]);

  const refreshCall = useCallback(async (callId: string) => {
    const next = await loadDetails(callId);
    if (!next) return;
    if (["declined", "missed", "cancelled", "ended"].includes(next.status)) {
      setCall(next);
      releaseMedia();
      setTimeout(() => setCall((current) => current?.id === next.id ? null : current), 1800);
      return;
    }
    setCall(next);
    if (next.status === "active") void connectMedia(next);
  }, [connectMedia, loadDetails, releaseMedia]);

  useEffect(() => {
    void supabase.rpc("expire_my_direct_calls_v16");
    void supabase.from("direct_calls").select("id").or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .in("status", ["ringing", "active"]).order("started_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.id) void refreshCall(data.id); });
    const caller = supabase.channel(`mobile-direct-caller-${userId}`).on("postgres_changes",
      { event: "*", schema: "public", table: "direct_calls", filter: `caller_id=eq.${userId}` },
      ({ new: row }) => { const id = (row as { id?: string }).id; if (id) void refreshCall(id); }).subscribe();
    const callee = supabase.channel(`mobile-direct-callee-${userId}`).on("postgres_changes",
      { event: "*", schema: "public", table: "direct_calls", filter: `callee_id=eq.${userId}` },
      ({ new: row }) => { const id = (row as { id?: string }).id; if (id) void refreshCall(id); }).subscribe();
    return () => { releaseMedia(); void supabase.removeChannel(caller); void supabase.removeChannel(callee); };
  }, [refreshCall, releaseMedia, userId]);

  const startCall = useCallback(async (calleeId: string) => {
    if (callRef.current || loading) return;
    setLoading(true); setError("");
    try {
      const { data, error: startError } = await supabase.rpc("start_direct_call_v18",
        { p_callee_id: calleeId, p_media_mode: "audio" });
      if (startError || !data) throw startError ?? new Error("call_not_created");
      const next = await loadDetails((data as DirectCall).id);
      if (next) setCall(next);
    } catch (cause) { setError(callError(cause)); setTimeout(() => setError(""), 3500); }
    finally { setLoading(false); }
  }, [loadDetails, loading]);

  async function answer(accept: boolean) {
    if (!call) return;
    setLoading(true);
    const { data, error: answerError } = await supabase.rpc("respond_direct_call_v16",
      { p_call_id: call.id, p_accept: accept });
    setLoading(false);
    if (answerError) { setError("Impossible de répondre à l’appel."); return; }
    const next = { ...call, ...(data as DirectCall) };
    setCall(next);
    if (accept) void connectMedia(next); else setTimeout(() => setCall(null), 900);
  }

  async function endCall() {
    if (!call) return;
    sendSignal({ to: call.caller_id === userId ? call.callee_id : call.caller_id, kind: "leave" });
    await supabase.rpc("end_direct_call_v16", { p_call_id: call.id });
    releaseMedia(); setCall(null);
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  const incoming = call?.callee_id === userId && call.status === "ringing";
  const displayName = call?.other_display_name || call?.other_username || "Joueur GameMate";
  const value = useMemo(() => ({ startCall, busy: Boolean(call) || loading }), [call, loading, startCall]);

  return <DirectCallsContext.Provider value={value}>
    {children}
    {!!error && !call && <View style={styles.toast}><Text style={styles.toastText}>{error}</Text></View>}
    <Modal visible={Boolean(call)} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}><View style={styles.sheet}>
        <View style={styles.glow} />
        <Text style={styles.eyebrow}>{incoming ? "APPEL ENTRANT" : call?.status === "ringing" ? "APPEL EN COURS" : "EN COMMUNICATION"}</Text>
        <Avatar name={displayName} url={call?.other_avatar_url} size={86} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>{call?.status === "ringing" ? (incoming ? "souhaite te parler" : "Sonnerie…")
          : call?.status === "active" ? "Appel vocal sécurisé" : call?.status === "missed" ? "Appel manqué" : "Appel terminé"}</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {loading ? <ActivityIndicator color={theme.colors.cyan} style={styles.loader} /> : incoming ? <View style={styles.actions}>
          <CallButton icon="close" label="Refuser" color={theme.colors.danger} onPress={() => void answer(false)} />
          <CallButton icon="call" label="Répondre" color={theme.colors.success} onPress={() => void answer(true)} />
        </View> : <View style={styles.actions}>
          {call?.status === "active" && <CallButton icon={muted ? "mic-off" : "mic"} label={muted ? "Réactiver" : "Micro"}
            color={muted ? theme.colors.warning : theme.colors.surfaceHover} onPress={toggleMute} />}
          <CallButton icon="call" label="Raccrocher" color={theme.colors.danger} onPress={() => void endCall()} />
        </View>}
      </View></View>
    </Modal>
  </DirectCallsContext.Provider>;
}

function CallButton({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.callAction}><View style={[styles.callCircle, { backgroundColor: color }]}>
    <Ionicons name={icon} size={25} color="#FFF" /></View><Text style={styles.callLabel}>{label}</Text></Pressable>;
}

export function useDirectCalls() {
  const context = useContext(DirectCallsContext);
  if (!context) throw new Error("DirectCallsProvider manquant");
  return context;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(0,3,13,0.82)" },
  sheet: { overflow: "hidden", alignItems: "center", padding: 28, borderRadius: 30, borderWidth: 1,
    borderColor: "rgba(91,225,255,0.34)", backgroundColor: "#071329" },
  glow: { position: "absolute", top: -100, width: 260, height: 200, borderRadius: 130, backgroundColor: "rgba(124,92,255,0.28)" },
  eyebrow: { color: theme.colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: 22 },
  name: { color: theme.colors.text, fontSize: 25, fontWeight: "900", marginTop: 18 },
  status: { color: theme.colors.textSoft, fontSize: 14, marginTop: 6 },
  error: { color: theme.colors.danger, textAlign: "center", marginTop: 12 },
  loader: { marginTop: 28 },
  actions: { flexDirection: "row", justifyContent: "center", gap: 38, marginTop: 30 },
  callAction: { alignItems: "center", gap: 8 },
  callCircle: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  callLabel: { color: theme.colors.textSoft, fontSize: 12, fontWeight: "700" },
  toast: { position: "absolute", zIndex: 30, left: 18, right: 18, top: 52, padding: 13, borderRadius: 14,
    borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: "#210D1B" },
  toastText: { color: theme.colors.text, textAlign: "center", fontWeight: "700" },
});
