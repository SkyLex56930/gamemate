import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./OverlayPage.css";

type SquadMember = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: "owner" | "member";
};

type SquadMessage = {
  id: string;
  sender_display_name: string | null;
  sender_username: string | null;
  body: string;
  created_at: string;
};

type ActiveSquad = {
  squad_id: string;
  name: string;
  game_name: string | null;
  members: SquadMember[];
  messages: SquadMessage[];
};

type SquadState = {
  active_squad: ActiveSquad | null;
};

type GameSession = {
  id: string;
  game_id: number | null;
  mode: string;
  server_region: string | null;
  status: "ready_check" | "in_game" | "finished" | "cancelled";
};

type MemberState = {
  user_id: string;
  readiness: "not_ready" | "ready" | "away";
  preferred_role: string | null;
};

type VoiceState = {
  joined: boolean;
  muted: boolean;
  deafened: boolean;
  channelName: string;
  updatedAt: number;
};

const EMPTY_STATE: SquadState = { active_squad: null };
const OVERLAY_VOICE_COMMAND_KEY = "gamemate-overlay-voice-command-v1";
const OVERLAY_VOICE_STATE_KEY = "gamemate-overlay-voice-state-v1";
const EMPTY_VOICE_STATE: VoiceState = {
  joined: false,
  muted: false,
  deafened: false,
  channelName: "Vocal de squad",
  updatedAt: 0,
};

function readVoiceState(): VoiceState {
  try {
    const raw = localStorage.getItem(OVERLAY_VOICE_STATE_KEY);
    if (!raw) return EMPTY_VOICE_STATE;
    const parsed = JSON.parse(raw) as Partial<VoiceState>;
    return {
      joined: Boolean(parsed.joined),
      muted: Boolean(parsed.muted),
      deafened: Boolean(parsed.deafened),
      channelName: parsed.channelName || EMPTY_VOICE_STATE.channelName,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return EMPTY_VOICE_STATE;
  }
}

export default function OverlayPage() {
  const [state, setState] = useState<SquadState>(EMPTY_STATE);
  const [session, setSession] = useState<GameSession | null>(null);
  const [memberStates, setMemberStates] = useState<MemberState[]>([]);
  const [gameName, setGameName] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState>(readVoiceState);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState("");
  const overlayWasFocusedRef = useRef(false);

  const hideOverlay = useCallback(async () => {
    overlayWasFocusedRef.current = false;
    try {
      await getCurrentWindow().hide();
    } catch (nextError) {
      console.error("GameMate overlay hide:", nextError);
    }
  }, []);

  const loadOverlay = useCallback(async () => {
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) {
      setSignedIn(false);
      setState(EMPTY_STATE);
      setSession(null);
      setMemberStates([]);
      setLoading(false);
      return;
    }

    setSignedIn(true);
    const stateResult = await supabase.rpc("get_my_squad_state");
    if (stateResult.error) {
      console.error("GameMate overlay squad:", stateResult.error);
      setError("La squad n’est pas disponible.");
      setLoading(false);
      return;
    }

    const nextState = (stateResult.data ?? EMPTY_STATE) as SquadState;
    const squad = nextState.active_squad ?? null;
    setState({ active_squad: squad });
    setError("");

    if (!squad) {
      setSession(null);
      setMemberStates([]);
      setGameName(null);
      setLoading(false);
      return;
    }

    const sessionResult = await supabase
      .from("squad_game_sessions")
      .select("id, game_id, mode, server_region, status")
      .eq("squad_id", squad.squad_id)
      .in("status", ["ready_check", "in_game"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionResult.error) {
      console.error("GameMate overlay session:", sessionResult.error);
      setSession(null);
      setMemberStates([]);
      setGameName(squad.game_name);
      setLoading(false);
      return;
    }

    const nextSession = (sessionResult.data ?? null) as GameSession | null;
    setSession(nextSession);
    setGameName(squad.game_name);

    if (!nextSession) {
      setMemberStates([]);
      setLoading(false);
      return;
    }

    const requests: PromiseLike<unknown>[] = [];
    const memberRequest = supabase
      .from("squad_game_session_members")
      .select("user_id, readiness, preferred_role")
      .eq("session_id", nextSession.id);
    requests.push(memberRequest);

    const gameRequest = nextSession.game_id == null
      ? null
      : supabase.from("games").select("name").eq("id", nextSession.game_id).maybeSingle();
    if (gameRequest) requests.push(gameRequest);

    const results = await Promise.all(requests);
    const membersResult = results[0] as {
      data: MemberState[] | null;
      error: { message: string } | null;
    };
    if (!membersResult.error) setMemberStates(membersResult.data ?? []);

    if (gameRequest) {
      const nextGameResult = results[1] as {
        data: { name: string } | null;
        error: { message: string } | null;
      };
      if (!nextGameResult.error && nextGameResult.data?.name) {
        setGameName(nextGameResult.data.name);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadOverlay();
  }, [loadOverlay]);

  useEffect(() => {
    const overlayWindow = getCurrentWindow();
    let unlistenFocus: (() => void) | undefined;
    let disposed = false;

    void overlayWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        overlayWasFocusedRef.current = true;
        return;
      }

      if (overlayWasFocusedRef.current) void hideOverlay();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFocus = unlisten;
    }).catch((nextError) => {
      console.error("GameMate overlay focus listener:", nextError);
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void hideOverlay();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      disposed = true;
      unlistenFocus?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hideOverlay]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => void loadOverlay());
    return () => data.subscription.unsubscribe();
  }, [loadOverlay]);

  useEffect(() => {
    const squadId = state.active_squad?.squad_id;
    if (!squadId) return undefined;

    let channel: RealtimeChannel | null = supabase
      .channel(`overlay:${squadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_game_sessions", filter: `squad_id=eq.${squadId}` }, () => void loadOverlay())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_game_session_members", filter: `squad_id=eq.${squadId}` }, () => void loadOverlay())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "squad_messages" }, () => void loadOverlay())
      .subscribe();

    return () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, [loadOverlay, state.active_squad?.squad_id]);

  useEffect(() => {
    function syncVoiceState(event: StorageEvent) {
      if (event.key === OVERLAY_VOICE_STATE_KEY) setVoice(readVoiceState());
    }

    window.addEventListener("storage", syncVoiceState);
    const interval = window.setInterval(() => setVoice(readVoiceState()), 1500);
    return () => {
      window.removeEventListener("storage", syncVoiceState);
      window.clearInterval(interval);
    };
  }, []);

  const squad = state.active_squad;
  const stateByUser = useMemo(
    () => new Map(memberStates.map((member) => [member.user_id, member])),
    [memberStates]
  );
  const readyCount = memberStates.filter((member) => member.readiness === "ready").length;
  const recentMessages = useMemo(
    () => [...(squad?.messages ?? [])]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 3),
    [squad?.messages]
  );

  function sendVoiceCommand(command: Pick<VoiceState, "muted"> | Pick<VoiceState, "deafened">) {
    localStorage.setItem(OVERLAY_VOICE_COMMAND_KEY, JSON.stringify({ ...command, sentAt: Date.now() }));
  }

  return (
    <main className="gm-overlay-shell">
      <header className="gm-overlay-header" data-tauri-drag-region>
        <div className="gm-overlay-brand" data-tauri-drag-region>
          <span>GM</span>
          <div data-tauri-drag-region><strong>GAME<span>MATE</span></strong><small>IN-GAME OVERLAY</small></div>
        </div>
        <div className="gm-overlay-header-actions">
          <kbd>CTRL + MAJ + O</kbd>
          <button type="button" aria-label="Fermer l’overlay" title="Fermer" onClick={() => void hideOverlay()}>×</button>
        </div>
      </header>

      <section className="gm-overlay-content">
        {loading ? (
          <div className="gm-overlay-empty"><i /><strong>Synchronisation…</strong><span>Connexion à ton Companion</span></div>
        ) : !signedIn ? (
          <div className="gm-overlay-empty"><b>G</b><strong>Connecte-toi dans Companion</strong><span>L’overlay reprendra automatiquement ta session.</span></div>
        ) : error ? (
          <div className="gm-overlay-empty error"><b>!</b><strong>{error}</strong><span>Ferme puis rouvre avec Ctrl+Maj+O.</span></div>
        ) : !squad ? (
          <div className="gm-overlay-empty"><b>+</b><strong>Aucune squad active</strong><span>Crée ou rejoins une squad dans Companion.</span></div>
        ) : (
          <>
            <section className="gm-overlay-session">
              <div className="gm-overlay-kicker"><span>SESSION ACTIVE</span><em className={session?.status === "in_game" ? "live" : ""}>{session?.status === "in_game" ? "EN JEU" : session ? "READY CHECK" : "EN ATTENTE"}</em></div>
              <h1>{gameName || "Session GameMate"}</h1>
              <p>{session ? [session.mode, session.server_region].filter(Boolean).join(" · ") : "Aucune partie préparée"}</p>
              {session && (
                <div className="gm-overlay-ready">
                  <div><span>ÉQUIPE PRÊTE</span><strong>{readyCount}/{squad.members.length}</strong></div>
                  <div className="gm-overlay-progress"><i style={{ width: `${squad.members.length ? (readyCount / squad.members.length) * 100 : 0}%` }} /></div>
                </div>
              )}
            </section>

            <section className="gm-overlay-panel">
              <div className="gm-overlay-title"><span>SQUAD · {squad.name}</span><b>{squad.members.length}</b></div>
              <div className="gm-overlay-roster">
                {squad.members.map((member) => {
                  const status = stateByUser.get(member.user_id);
                  const displayName = member.display_name || member.username || "Joueur";
                  return (
                    <article key={member.user_id}>
                      <span className="gm-overlay-avatar">{member.avatar_url ? <img src={member.avatar_url} alt="" /> : displayName.slice(0, 1).toUpperCase()}</span>
                      <div><strong>{displayName}</strong><small>{status?.preferred_role || (member.role === "owner" ? "Chef de squad" : "Membre")}</small></div>
                      <em className={status?.readiness || "not_ready"}>{status?.readiness === "ready" ? "PRÊT" : status?.readiness === "away" ? "ABSENT" : "ATTENTE"}</em>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="gm-overlay-panel gm-overlay-voice">
              <div className="gm-overlay-title"><span>VOCAL · {voice.channelName}</span><b className={voice.joined ? "online" : ""}>{voice.joined ? "ACTIF" : "OFF"}</b></div>
              <div className="gm-overlay-voice-controls">
                <button type="button" disabled={!voice.joined} className={voice.muted ? "active" : ""} onClick={() => sendVoiceCommand({ muted: !voice.muted })}><span>{voice.muted ? "×" : "●"}</span><strong>{voice.muted ? "Micro coupé" : "Micro actif"}</strong></button>
                <button type="button" disabled={!voice.joined} className={voice.deafened ? "active" : ""} onClick={() => sendVoiceCommand({ deafened: !voice.deafened })}><span>◉</span><strong>{voice.deafened ? "Mode sourd" : "Son actif"}</strong></button>
              </div>
              {!voice.joined && <p>Rejoins d’abord un salon vocal dans la fenêtre Companion.</p>}
            </section>

            <section className="gm-overlay-panel gm-overlay-chat">
              <div className="gm-overlay-title"><span>MESSAGES RÉCENTS</span><b>{recentMessages.length}</b></div>
              {recentMessages.length ? recentMessages.map((message) => (
                <article key={message.id}><strong>{message.sender_display_name || message.sender_username || "Joueur"}</strong><p>{message.body}</p></article>
              )) : <p className="gm-overlay-no-message">Aucun message récent.</p>}
            </section>
          </>
        )}
      </section>

      <footer><span><i /> SYNCHRONISÉ</span><small>Ctrl+Maj+O pour masquer</small></footer>
    </main>
  );
}
