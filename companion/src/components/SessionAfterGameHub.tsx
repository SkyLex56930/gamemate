import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SessionAfterGameHub.css";

type HubPlayer = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  preferred_role: string | null;
  readiness: "not_ready" | "ready" | "away";
  is_favorite: boolean;
  friendship_status: "none" | "pending_outgoing" | "pending_incoming" | "accepted";
};

type HubSession = {
  id: string;
  game_name: string | null;
  mode: string;
  server_region: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
};

type HubData = {
  session: HubSession;
  players: HubPlayer[];
};

type RecentSession = {
  id: string;
  game_name: string | null;
  mode: string;
  server_region: string | null;
  status: "finished" | "cancelled";
  created_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  player_count: number;
};

type Props = {
  sessionId: string;
  currentUserId: string;
  isOwner: boolean;
  working: string | null;
  onReplay: () => void;
  onNewSession: () => void;
  onOpenChat: () => void;
  onOpenFriends: () => void;
  onOpenMessages: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
};

export default function SessionAfterGameHub({
  sessionId,
  currentUserId,
  isOwner,
  working,
  onReplay,
  onNewSession,
  onOpenChat,
  onOpenFriends,
  onOpenMessages,
  onOpenProfile,
}: Props) {
  const [hub, setHub] = useState<HubData | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadHub = useCallback(async () => {
    setLoading(true);
    const [hubResult, historyResult] = await Promise.all([
      supabase.rpc("get_session_hub", { p_session_id: sessionId }),
      supabase.rpc("get_my_recent_game_sessions", { p_limit: 6 }),
    ]);

    if (hubResult.error) {
      console.error("Session hub:", hubResult.error);
      setError("Le résumé est indisponible. Vérifie que le SQL Hub de session V5 est installé.");
    } else {
      setHub(hubResult.data as HubData);
    }

    if (historyResult.error) {
      console.error("Recent game sessions:", historyResult.error);
    } else {
      setRecentSessions((historyResult.data ?? []) as RecentSession[]);
    }

    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const teammates = useMemo(
    () => hub?.players.filter((player) => player.user_id !== currentUserId) ?? [],
    [hub?.players, currentUserId]
  );

  async function toggleFavorite(player: HubPlayer) {
    setBusyPlayerId(player.user_id);
    setError("");
    setNotice("");

    const { error: favoriteError } = await supabase.rpc("set_session_player_favorite", {
      p_session_id: sessionId,
      p_player_user_id: player.user_id,
      p_favorite: !player.is_favorite,
    });

    if (favoriteError) {
      console.error("Session favorite:", favoriteError);
      setError("Impossible de modifier ce favori pour le moment.");
    } else {
      setNotice(player.is_favorite ? "Joueur retiré de tes favoris." : "Joueur ajouté à tes favoris privés.");
      await loadHub();
    }

    setBusyPlayerId(null);
  }

  async function sendFriendRequest(player: HubPlayer) {
    setBusyPlayerId(player.user_id);
    setError("");
    setNotice("");

    const { error: requestError } = await supabase.rpc("send_friend_request", {
      p_target_user_id: player.user_id,
    });

    if (requestError) {
      console.error("Session friend request:", requestError);
      setError(
        requestError.message.includes("blocked")
          ? "Cette demande ne peut pas être envoyée."
          : "Impossible d’envoyer la demande d’ami."
      );
    } else {
      setNotice(`Demande envoyée à ${playerName(player)}.`);
      await loadHub();
    }

    setBusyPlayerId(null);
  }

  if (loading && !hub) {
    return <div className="session-hub-loading">Préparation du résumé de partie...</div>;
  }

  return (
    <div className="session-hub">
      <section className="session-hub-hero">
        <div>
          <span className="session-hub-kicker">APRÈS LA PARTIE</span>
          <h3>Bien joué, la squad.</h3>
          <p>
            Ton historique et tes favoris restent privés. Les actions ci-dessous sont reliées à
            tes vrais amis, messages et profils GameMate.
          </p>
        </div>
        <div className="session-hub-stats">
          <div><span>DURÉE</span><strong>{formatDuration(hub?.session.duration_seconds)}</strong></div>
          <div><span>JOUEURS</span><strong>{hub?.players.length ?? 0}</strong></div>
          <div><span>RÉGION</span><strong>{hub?.session.server_region || "—"}</strong></div>
        </div>
      </section>

      {error && <div className="session-hub-alert error">{error}</div>}
      {notice && <div className="session-hub-alert">{notice}</div>}

      <div className="session-hub-grid">
        <section className="session-hub-panel session-hub-players">
          <header>
            <div><span>ÉQUIPE DE LA PARTIE</span><h4>Retrouve tes mates</h4></div>
            <b>{teammates.length}</b>
          </header>

          {teammates.length === 0 ? (
            <div className="session-hub-empty">Aucun autre joueur dans cette session.</div>
          ) : (
            <div className="session-hub-player-list">
              {teammates.map((player) => (
                <article key={player.user_id} className="session-hub-player">
                  <button
                    type="button"
                    className="session-hub-avatar"
                    onClick={() => onOpenProfile(player.user_id)}
                    aria-label={`Voir le profil de ${playerName(player)}`}
                  >
                    {player.avatar_url
                      ? <img src={player.avatar_url} alt="" />
                      : playerName(player).slice(0, 1).toUpperCase()}
                  </button>
                  <div className="session-hub-player-copy">
                    <strong>{playerName(player)}</strong>
                    <small>{player.preferred_role || "Rôle non défini"}</small>
                  </div>
                  <div className="session-hub-player-actions">
                    <button type="button" onClick={() => onOpenProfile(player.user_id)}>Profil</button>
                    {player.friendship_status === "accepted" && (
                      <button type="button" className="primary" onClick={() => onOpenMessages(player.user_id)}>
                        Message
                      </button>
                    )}
                    {player.friendship_status === "none" && (
                      <button
                        type="button"
                        className="primary"
                        disabled={busyPlayerId === player.user_id}
                        onClick={() => void sendFriendRequest(player)}
                      >
                        {busyPlayerId === player.user_id ? "Envoi..." : "Ajouter en ami"}
                      </button>
                    )}
                    {player.friendship_status === "pending_outgoing" && (
                      <span className="session-hub-pending">Demande envoyée</span>
                    )}
                    {player.friendship_status === "pending_incoming" && (
                      <button type="button" className="primary" onClick={onOpenFriends}>Voir la demande</button>
                    )}
                    <button
                      type="button"
                      className={player.is_favorite ? "favorite active" : "favorite"}
                      disabled={busyPlayerId === player.user_id}
                      onClick={() => void toggleFavorite(player)}
                      aria-pressed={player.is_favorite}
                    >
                      {player.is_favorite ? "★ Favori" : "☆ Favori"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="session-hub-side">
          <section className="session-hub-panel session-hub-next">
            <span>PROCHAINE ACTION</span>
            <h4>On continue ?</h4>
            {isOwner ? (
              <>
                <button type="button" className="session-hub-primary" disabled={Boolean(working)} onClick={onReplay}>
                  {working === "replay" ? "Relance..." : "Rejouer avec la squad"}
                </button>
                <button type="button" disabled={Boolean(working)} onClick={onNewSession}>
                  Préparer une autre session
                </button>
              </>
            ) : (
              <button type="button" className="session-hub-primary" onClick={onOpenChat}>
                Proposer de rejouer dans le chat
              </button>
            )}
            <button type="button" onClick={onOpenChat}>Ouvrir le chat de squad</button>
          </section>

          <section className="session-hub-panel session-hub-history">
            <header><span>HISTORIQUE PRIVÉ</span><b>{recentSessions.length}</b></header>
            {recentSessions.length === 0 ? (
              <div className="session-hub-empty small">Ta première session apparaîtra ici.</div>
            ) : (
              recentSessions.map((recent) => (
                <article key={recent.id}>
                  <div>
                    <strong>{recent.game_name || "Session multi-jeux"}</strong>
                    <small>{recent.mode}{recent.server_region ? ` · ${recent.server_region}` : ""}</small>
                  </div>
                  <span>{formatDuration(recent.duration_seconds)}</span>
                </article>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function playerName(player: HubPlayer) {
  return player.display_name || player.username || "Joueur GameMate";
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${rest} min`;
}
