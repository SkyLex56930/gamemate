import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type Player = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
  created_at: string | null;
  presence_status: "online" | "busy" | "offline";
  last_seen_at: string | null;
  custom_status: string | null;
  activity_text: string | null;
  activity_game_id: number | null;
  activity_game_name: string | null;
};

function playerLabel(player: Player) {
  return player.display_name || player.username || player.id.slice(0, 8);
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [messageTitle, setMessageTitle] = useState("Message de GameMate");
  const [messageBody, setMessageBody] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPlayers() {
    const { data, error } = await supabase.rpc("admin_list_players", {
      p_search: null,
      p_only_online: false,
      p_limit: 300,
    });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Player[];
    setPlayers(rows);
    setSelectedId((current) =>
      current && rows.some((player) => player.id === current)
        ? current
        : rows[0]?.id ?? null
    );
  }

  useEffect(() => {
    void loadPlayers();

    const channel = supabase
      .channel("admin-players-live-v1")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => void loadPlayers())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadPlayers())
      .subscribe();

    const timer = window.setInterval(() => void loadPlayers(), 30000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const visiblePlayers = useMemo(() => {
    const search = query.trim().toLowerCase();

    return players.filter((player) => {
      if (onlyOnline && !["online", "busy"].includes(player.presence_status)) return false;
      if (!search) return true;

      return [
        player.display_name,
        player.username,
        player.region,
        player.activity_game_name,
        player.activity_text,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [players, query, onlyOnline]);

  const selected = players.find((player) => player.id === selectedId) ?? null;
  const onlineCount = players.filter((player) => player.presence_status === "online").length;
  const busyCount = players.filter((player) => player.presence_status === "busy").length;

  async function sendMessage() {
    if (!selected || !messageTitle.trim() || !messageBody.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error } = await supabase.rpc("admin_send_user_message", {
      p_recipient_id: selected.id,
      p_title: messageTitle.trim(),
      p_body: messageBody.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      setMessageBody("");
      setNotice(`Message envoyé à ${playerLabel(selected)}.`);
    }

    setBusy(false);
  }

  return (
    <div className="page admin-players-page">
      <header className="pageHead admin-simple-head">
        <div>
          <span className="eyebrow">COMMUNAUTÉ</span>
          <h1>Joueurs</h1>
          <p>Retrouve les comptes GameMate, leur activité et contacte-les directement.</p>
        </div>

        <button type="button" className="primary small" onClick={() => void loadPlayers()}>
          Actualiser
        </button>
      </header>

      <div className="admin-kpi-grid compact">
        <article><small>Joueurs</small><strong>{players.length}</strong></article>
        <article><small>En ligne</small><strong>{onlineCount}</strong></article>
        <article><small>Occupés</small><strong>{busyCount}</strong></article>
        <article><small>Hors ligne</small><strong>{Math.max(0, players.length - onlineCount - busyCount)}</strong></article>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <div className="admin-player-layout">
        <section className="panel admin-player-list-panel">
          <div className="admin-player-filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un joueur..."
            />

            <button
              type="button"
              className={onlyOnline ? "active" : ""}
              onClick={() => setOnlyOnline((value) => !value)}
            >
              En ligne uniquement
            </button>
          </div>

          <div className="admin-player-list">
            {visiblePlayers.map((player) => (
              <button
                type="button"
                key={player.id}
                className={selectedId === player.id ? "active" : ""}
                onClick={() => setSelectedId(player.id)}
              >
                <span className="admin-player-avatar">
                  {player.avatar_url ? (
                    <img src={player.avatar_url} alt="" />
                  ) : (
                    playerLabel(player).slice(0, 1).toUpperCase()
                  )}
                  <i className={`presence ${player.presence_status}`} />
                </span>

                <span className="admin-player-meta">
                  <strong>{playerLabel(player)}</strong>
                  <small>
                    @{player.username || "sans-pseudo"} ·{" "}
                    {player.activity_game_name || player.activity_text || "Aucune activité"}
                  </small>
                </span>

                <b className={`admin-presence-pill ${player.presence_status}`}>
                  {player.presence_status === "online"
                    ? "En ligne"
                    : player.presence_status === "busy"
                    ? "Occupé"
                    : "Hors ligne"}
                </b>
              </button>
            ))}

            {visiblePlayers.length === 0 && (
              <div className="admin-empty-clean">
                <strong>Aucun joueur trouvé.</strong>
                <span>Essaie une autre recherche.</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel admin-player-detail">
          {selected ? (
            <>
              <div className="admin-player-detail-head">
                <span className="admin-player-avatar large">
                  {selected.avatar_url ? (
                    <img src={selected.avatar_url} alt="" />
                  ) : (
                    playerLabel(selected).slice(0, 1).toUpperCase()
                  )}
                  <i className={`presence ${selected.presence_status}`} />
                </span>

                <div>
                  <span className="eyebrow">JOUEUR</span>
                  <h2>{playerLabel(selected)}</h2>
                  <p>@{selected.username || "sans-pseudo"} · {selected.region || "Région non renseignée"}</p>
                </div>
              </div>

              <div className="admin-player-info-grid">
                <article>
                  <small>Statut</small>
                  <strong>
                    {selected.presence_status === "online"
                      ? "En ligne"
                      : selected.presence_status === "busy"
                      ? "Occupé"
                      : "Hors ligne"}
                  </strong>
                </article>

                <article>
                  <small>Jeu / activité</small>
                  <strong>{selected.activity_game_name || selected.activity_text || "—"}</strong>
                </article>

                <article>
                  <small>Statut perso</small>
                  <strong>{selected.custom_status || "—"}</strong>
                </article>

                <article>
                  <small>Dernière activité</small>
                  <strong>
                    {selected.last_seen_at
                      ? new Date(selected.last_seen_at).toLocaleString("fr-FR")
                      : "—"}
                  </strong>
                </article>
              </div>

              <div className="admin-message-composer">
                <span className="eyebrow">MESSAGE GAMEMATE</span>
                <h3>Contacter ce joueur</h3>

                <input
                  value={messageTitle}
                  onChange={(event) => setMessageTitle(event.target.value)}
                  placeholder="Titre"
                  maxLength={120}
                />

                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  rows={6}
                  placeholder="Écris ton message au joueur..."
                  maxLength={4000}
                />

                <button
                  className="primary"
                  disabled={busy || !messageTitle.trim() || !messageBody.trim()}
                  onClick={() => void sendMessage()}
                >
                  {busy ? "Envoi..." : "Envoyer le message"}
                </button>
              </div>
            </>
          ) : (
            <div className="admin-empty-clean">
              <strong>Sélectionne un joueur.</strong>
              <span>Ses informations apparaîtront ici.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

