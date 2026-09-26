import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/Icon";
import { lastSeenLabel, presenceActivity, presenceLabel, type PresenceSnapshot } from "../lib/presence";
import "./PublicProfilePage.css";

type Props = {
  userId: string;
  onBack: () => void;
  onOpenMessages: (userId: string) => void;
  onOpenFriends: () => void;
  onOpenSquads: () => void;
  onOpenOwnProfile: () => void;
};

type Cosmetic = {
  id: string;
  name: string;
  rarity: string;
  style: { accent?: string; gradient?: string; class?: string } | null;
};

type PlayerProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
  frame: Cosmetic | null;
  banner_cosmetic: Cosmetic | null;
};

type PlayerGame = {
  game_id: number;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  platform: string | null;
  rank: string | null;
  role: string | null;
  mode: string | null;
  mic_enabled: boolean;
  crossplay_enabled: boolean;
  is_primary: boolean;
};

type PlayerTag = {
  id: number;
  label: string;
  category?: string | null;
  description?: string | null;
};

type SocialState = {
  viewer_is_self: boolean;
  friendship_id: string | null;
  friendship_state: "none" | "pending_outgoing" | "pending_incoming" | "accepted";
  blocked_by_me: boolean;
  can_message: boolean;
  allow_friend_requests: boolean;
  viewer_squad_id: string | null;
  viewer_squad_game_id: number | null;
  viewer_is_squad_owner: boolean;
  target_in_squad: boolean;
  squad_invite_pending: boolean;
  can_invite: boolean;
};

type PrivacyState = {
  bio_visible: boolean;
  region_visible: boolean;
  language_visible: boolean;
  games_visible: boolean;
  gaming_dna_visible: boolean;
  looking_for_visible: boolean;
};

type PublicPlayerData = {
  profile: PlayerProfile;
  games: PlayerGame[];
  gaming_dna: PlayerTag[];
  looking_for: PlayerTag[];
  privacy: PrivacyState;
  social: SocialState;
};

export default function PublicProfilePage({
  userId,
  onBack,
  onOpenMessages,
  onOpenFriends,
  onOpenSquads,
  onOpenOwnProfile,
}: Props) {
  const [data, setData] = useState<PublicPlayerData | null>(null);
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [reportType, setReportType] = useState("behavior");
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportFeedback, setReportFeedback] = useState("");

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");

    const [profileResult, presenceResult] = await Promise.all([
      supabase.rpc("get_public_player_profile", { p_user_id: userId }),
      supabase.rpc("get_presence_v15", { p_user_ids: [userId] }),
    ]);
    const result = profileResult.data;
    const loadError = profileResult.error;

    if (loadError || !result) {
      console.error("Public profile:", loadError);
      setError(publicError(loadError?.message));
      setLoading(false);
      return;
    }

    setData(result as PublicPlayerData);
    setPresence(((presenceResult.data ?? []) as PresenceSnapshot[])[0] ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadProfile();

    const channel = supabase
      .channel(`public-player-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => void loadProfile(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void loadProfile(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "user_blocks" }, () => void loadProfile(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_invites" }, () => void loadProfile(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => void loadProfile(true))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadProfile, userId]);

  async function runAction(
    key: string,
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success: string
  ) {
    setBusy(key);
    setNotice("");
    const result = await action();
    if (result.error) {
      setNotice(publicError(result.error.message));
    } else {
      setNotice(success);
      await loadProfile(true);
    }
    setBusy(null);
  }

  function sendFriendRequest() {
    return runAction(
      "friend",
      () => supabase.rpc("send_friend_request", { p_target_user_id: userId }),
      "Demande d’ami envoyée."
    );
  }

  function respondFriendRequest(accept: boolean) {
    if (!data?.social.friendship_id) return Promise.resolve();
    return runAction(
      accept ? "accept" : "decline",
      () => supabase.rpc("respond_friend_request", {
        p_request_id: data.social.friendship_id,
        p_accept: accept,
      }),
      accept ? "Vous êtes maintenant amis." : "Demande refusée."
    );
  }

  function inviteToSquad() {
    if (!data) return Promise.resolve();
    return runAction(
      "squad",
      () => supabase.rpc("invite_to_squad", {
        p_recipient_id: userId,
        p_game_id: data.social.viewer_squad_game_id,
      }),
      "Invitation de squad envoyée."
    );
  }

  function blockPlayer() {
    return runAction(
      "block",
      () => supabase.rpc("block_user", { p_target_user_id: userId }),
      "Ce joueur est maintenant bloqué."
    ).then(() => setShowBlockConfirm(false));
  }

  function unblockPlayer() {
    return runAction(
      "unblock",
      () => supabase.rpc("unblock_user", { p_target_user_id: userId }),
      "Joueur débloqué."
    );
  }

  async function submitReport() {
    if (!reportReason.trim()) return;
    setBusy("report");
    setReportFeedback("");

    const { data: reportId, error: reportError } = await supabase.rpc(
      "create_user_report",
      {
        p_target_user_id: userId,
        p_report_type: reportType,
        p_reason: reportReason.trim(),
        p_details: reportDetails.trim() || null,
      }
    );

    if (reportError) {
      setReportFeedback(publicError(reportError.message));
    } else {
      setReportFeedback(`Signalement #${Number(reportId)} transmis à la modération.`);
      setReportReason("");
      setReportDetails("");
    }
    setBusy(null);
  }

  if (loading) {
    return (
      <section className="pub6 pub6-loading">
        <span className="pub6-loader" />
        <strong>Chargement du profil joueur…</strong>
        <small>GameMate prépare les informations publiques.</small>
      </section>
    );
  }

  if (!data || error) {
    return (
      <section className="pub6 pub6-unavailable">
        <span className="pub6-eyebrow">PROFIL JOUEUR</span>
        <h1>Profil indisponible</h1>
        <p>{error || "Impossible de charger ce profil."}</p>
        <div>
          <button type="button" onClick={onBack}>← Retour</button>
          <button type="button" onClick={() => void loadProfile()}>Réessayer</button>
        </div>
      </section>
    );
  }

  const { profile, social, privacy } = data;
  const primaryGame = data.games.find((game) => game.is_primary) ?? data.games[0] ?? null;
  const name = profile.display_name || profile.username || "Joueur GameMate";
  const initial = name.slice(0, 1).toUpperCase();
  const accent = profile.frame?.style?.accent || "#7c5cff";
  const frameGradient = profile.frame?.style?.gradient || `linear-gradient(135deg, ${accent}, #23c7ff)`;
  const bannerGradient = profile.banner_cosmetic?.style?.gradient || "linear-gradient(120deg, #101d45 0%, #251557 48%, #09293b 100%)";
  const pageStyle = {
    "--pub-accent": accent,
    "--pub-frame": frameGradient,
    "--pub-banner": bannerGradient,
  } as CSSProperties;

  return (
    <div className="pub6" style={pageStyle}>
      <button type="button" className="pub6-back" onClick={onBack}>← Retour</button>

      <section className="pub6-hero">
        <div className="pub6-banner">
          {profile.banner_url && !profile.banner_cosmetic && (
            <img src={profile.banner_url} alt="" />
          )}
          <div className="pub6-banner-glow" />
          <span className="pub6-brand">GAMEMATE / PLAYER PROFILE</span>
        </div>

        <div className="pub6-hero-content">
          <div className="pub6-avatar-frame">
            <div className="pub6-avatar">
              {profile.avatar_url ? <img src={profile.avatar_url} alt={name} /> : initial}
            </div>
          </div>

          <div className="pub6-identity">
            <div className="pub6-name-row">
              <h1>{name}</h1>
              {primaryGame && (
                <span className="pub6-playing">JEU PRINCIPAL · {primaryGame.name}</span>
              )}
            </div>
            <p className="pub6-handle">
              {profile.username ? `@${profile.username}` : "Compte GameMate"}
            </p>
            {presence && (
              <div className={`pub6-presence ${presence.status}`}>
                <i />
                <strong>{presenceLabel(presence.status)}</strong>
                <span>{presence.status === "offline" ? lastSeenLabel(presence.last_seen_at) : presenceActivity(presence)}</span>
              </div>
            )}
            <div className="pub6-meta">
              {profile.region && <span><Icon name="map-pin" size={13} /> {profile.region}</span>}
              {profile.language && <span><Icon name="globe" size={13} /> {profile.language}</span>}
              <span>
                {data.games.length} jeu{data.games.length > 1 ? "x" : ""} public
                {data.games.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="pub6-primary-actions">
            {social.viewer_is_self ? (
              <button type="button" className="pub6-action primary" onClick={onOpenOwnProfile}>
                Modifier mon profil
              </button>
            ) : social.blocked_by_me ? (
              <button type="button" className="pub6-action" disabled={busy === "unblock"} onClick={() => void unblockPlayer()}>
                {busy === "unblock" ? "Déblocage…" : "Débloquer"}
              </button>
            ) : (
              <SocialActions
                social={social}
                busy={busy}
                onMessage={() => onOpenMessages(userId)}
                onSendFriend={() => void sendFriendRequest()}
                onAccept={() => void respondFriendRequest(true)}
                onDecline={() => void respondFriendRequest(false)}
                onOpenFriends={onOpenFriends}
              />
            )}
          </div>
        </div>
      </section>

      {notice && <div className="pub6-notice">{notice}</div>}

      {social.blocked_by_me ? (
        <section className="pub6-blocked-card">
          <span><Icon name="ban" size={27} /></span>
          <div>
            <strong>Profil masqué</strong>
            <p>Tu as bloqué ce joueur. Débloque-le pour revoir ses informations et interagir avec lui.</p>
          </div>
        </section>
      ) : (
        <div className="pub6-layout">
          <main className="pub6-main">
            <section className="pub6-card pub6-about">
              <CardHeader eyebrow="À PROPOS" title="Présentation" />
              {profile.bio ? (
                <p>{profile.bio}</p>
              ) : (
                <EmptyState text={privacy.bio_visible ? "Ce joueur n’a pas encore ajouté de présentation." : "Cette présentation est privée."} />
              )}

              {data.gaming_dna.length > 0 ? (
                <div className="pub6-tags">
                  {data.gaming_dna.map((tag) => <span key={tag.id}>{tag.label}</span>)}
                </div>
              ) : !privacy.gaming_dna_visible ? (
                <small className="pub6-private">Gaming DNA privé</small>
              ) : null}
            </section>

            <section className="pub6-card">
              <CardHeader eyebrow="BIBLIOTHÈQUE" title="Jeux et préférences" count={data.games.length} />
              {data.games.length > 0 ? (
                <div className="pub6-games">
                  {data.games.map((game) => (
                    <GameCard game={game} key={`${game.game_id}-${game.platform ?? "none"}`} />
                  ))}
                </div>
              ) : (
                <EmptyState text={privacy.games_visible ? "Aucun jeu n’est encore renseigné." : "La bibliothèque de ce joueur est privée."} />
              )}
            </section>
          </main>

          <aside className="pub6-side">
            <section className="pub6-card pub6-looking">
              <CardHeader eyebrow="RECHERCHE" title="Ce qu’il recherche" />
              {data.looking_for.length > 0 ? (
                <div className="pub6-looking-list">
                  {data.looking_for.map((item) => (
                    <div key={item.id}>
                      <span><Icon name="sparkles" /></span>
                      <div>
                        <strong>{item.label}</strong>
                        {item.description && <small>{item.description}</small>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState compact text={privacy.looking_for_visible ? "Aucune intention renseignée." : "Ces informations sont privées."} />
              )}
            </section>

            {!social.viewer_is_self && (
              <section className="pub6-card pub6-squad-card">
                <CardHeader eyebrow="SQUAD" title="Jouer ensemble" />
                {social.target_in_squad ? (
                  <p className="pub6-status-ok"><Icon name="check" size={15} /> Ce joueur est déjà dans ta squad.</p>
                ) : social.squad_invite_pending ? (
                  <p>Invitation déjà envoyée et en attente.</p>
                ) : social.can_invite ? (
                  <button type="button" className="pub6-action primary full" disabled={busy === "squad"} onClick={() => void inviteToSquad()}>
                    {busy === "squad" ? "Invitation…" : "Inviter dans ma squad"}
                  </button>
                ) : social.viewer_squad_id && !social.viewer_is_squad_owner ? (
                  <>
                    <p>Seul le chef de ta squad peut envoyer cette invitation.</p>
                    <button type="button" className="pub6-link-button" onClick={onOpenSquads}>Ouvrir ma squad <Icon name="arrow-right" size={14} /></button>
                  </>
                ) : social.viewer_squad_id ? (
                  <p>Ce joueur n’accepte pas les invitations de squad.</p>
                ) : (
                  <>
                    <p>Crée d’abord une squad pour inviter ce joueur.</p>
                    <button type="button" className="pub6-link-button" onClick={onOpenSquads}>Créer une squad <Icon name="arrow-right" size={14} /></button>
                  </>
                )}
              </section>
            )}

            {!social.viewer_is_self && (
              <section className="pub6-card pub6-safety">
                <CardHeader eyebrow="SÉCURITÉ" title="Contrôles" />
                <button type="button" onClick={() => { setReportFeedback(""); setShowReport(true); }}>
                  Signaler ce joueur
                </button>
                <button type="button" className="danger" onClick={() => setShowBlockConfirm(true)}>
                  Bloquer ce joueur
                </button>
              </section>
            )}
          </aside>
        </div>
      )}

      {showReport && (
        <Modal title={`Signaler ${name}`} eyebrow="MODÉRATION" onClose={() => setShowReport(false)}>
          <label className="pub6-field">
            <span>Type</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              <option value="behavior">Comportement</option>
              <option value="chat">Chat</option>
              <option value="profile">Profil</option>
              <option value="voice">Vocal</option>
              <option value="community">Communauté</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="pub6-field">
            <span>Motif</span>
            <input value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Décris brièvement le problème" />
          </label>
          <label className="pub6-field">
            <span>Détails utiles</span>
            <textarea rows={5} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Contexte, date, conversation concernée…" />
          </label>
          {reportFeedback && <div className="pub6-modal-feedback">{reportFeedback}</div>}
          <div className="pub6-modal-actions">
            <button type="button" onClick={() => setShowReport(false)}>Fermer</button>
            <button type="button" className="danger" disabled={busy === "report" || !reportReason.trim()} onClick={() => void submitReport()}>
              {busy === "report" ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </Modal>
      )}

      {showBlockConfirm && (
        <Modal title={`Bloquer ${name} ?`} eyebrow="CONFIRMATION" onClose={() => setShowBlockConfirm(false)}>
          <p className="pub6-confirm-copy">
            Vous ne pourrez plus vous envoyer de demande, de message ou d’invitation. Tu pourras le débloquer depuis ce profil.
          </p>
          <div className="pub6-modal-actions">
            <button type="button" onClick={() => setShowBlockConfirm(false)}>Annuler</button>
            <button type="button" className="danger" disabled={busy === "block"} onClick={() => void blockPlayer()}>
              {busy === "block" ? "Blocage…" : "Bloquer"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SocialActions({
  social,
  busy,
  onMessage,
  onSendFriend,
  onAccept,
  onDecline,
  onOpenFriends,
}: {
  social: SocialState;
  busy: string | null;
  onMessage: () => void;
  onSendFriend: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onOpenFriends: () => void;
}) {
  if (social.friendship_state === "accepted") {
    return <button type="button" className="pub6-action primary" onClick={onMessage}>Message</button>;
  }
  if (social.friendship_state === "pending_incoming") {
    return (
      <>
        <button type="button" className="pub6-action primary" disabled={busy === "accept"} onClick={onAccept}>
          {busy === "accept" ? "Validation…" : "Accepter"}
        </button>
        <button type="button" className="pub6-action" disabled={busy === "decline"} onClick={onDecline}>Refuser</button>
      </>
    );
  }
  if (social.friendship_state === "pending_outgoing") {
    return <button type="button" className="pub6-action" onClick={onOpenFriends}>Demande envoyée · Voir</button>;
  }
  if (!social.allow_friend_requests) {
    return <button type="button" className="pub6-action" disabled>Demandes fermées</button>;
  }
  return (
    <button type="button" className="pub6-action primary" disabled={busy === "friend"} onClick={onSendFriend}>
      {busy === "friend" ? "Envoi…" : <><Icon name="user-plus" size={15} /> Ajouter en ami</>}
    </button>
  );
}

function GameCard({ game }: { game: PlayerGame }) {
  return (
    <article className={`pub6-game ${game.is_primary ? "primary" : ""}`}>
      <div className="pub6-game-art">
        {game.cover_url ? (
          <img src={game.cover_url} alt="" />
        ) : game.logo_url ? (
          <img src={game.logo_url} alt="" />
        ) : (
          <span>{game.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="pub6-game-body">
        <div>
          <strong>{game.name}</strong>
          {game.is_primary && <i>Principal</i>}
          <small>{game.platform || "Plateforme non renseignée"}</small>
        </div>
        <div className="pub6-game-stats">
          {game.rank && <Stat label="Rang" value={game.rank} />}
          {game.role && <Stat label="Rôle" value={game.role} />}
          {game.mode && <Stat label="Mode" value={game.mode} />}
        </div>
        <div className="pub6-game-flags">
          {game.mic_enabled && <span><Icon name="mic" size={13} /> Micro</span>}
          {game.crossplay_enabled && <span><Icon name="link" size={13} /> Crossplay</span>}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function CardHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return (
    <header className="pub6-card-head">
      <div><span className="pub6-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {typeof count === "number" && <b>{count}</b>}
    </header>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`pub6-empty ${compact ? "compact" : ""}`}><span><Icon name="layout-grid" size={24} /></span><p>{text}</p></div>;
}

function Modal({ title, eyebrow, onClose, children }: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pub6-modal-backdrop" onMouseDown={onClose}>
      <section className="pub6-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="pub6-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={17} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function publicError(message?: string) {
  if (!message) return "Une erreur est survenue. Réessaie dans un instant.";
  if (message.includes("profile_unavailable") || message.includes("profile_not_found")) return "Ce profil n’est pas disponible.";
  if (message.includes("authentication_required")) return "Connecte-toi pour consulter ce profil.";
  if (message.includes("friend_requests_disabled")) return "Ce joueur n’accepte pas les demandes d’ami.";
  if (message.includes("squad_invites_disabled")) return "Ce joueur n’accepte pas les invitations de squad.";
  return message;
}
