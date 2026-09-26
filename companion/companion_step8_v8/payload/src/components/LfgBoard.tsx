import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./LfgBoard.css";

type UserGame = {
  game_id: string;
  platform_id: string | null;
  is_primary: boolean;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean;
  crossplay_enabled: boolean;
  gameName: string;
  platformName: string | null;
};

type Scope = "all" | "mine" | "applications";
type ApplicationState = "none" | "pending" | "accepted" | "declined" | "cancelled";

type LfgApplication = {
  application_id: string;
  applicant_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  message: string | null;
  status: Exclude<ApplicationState, "none">;
  created_at: string;
};

type LfgPost = {
  post_id: string;
  owner_id: string;
  owner_display_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
  game_id: number;
  game_name: string;
  game_logo_url: string | null;
  platform_id: number | null;
  platform_name: string | null;
  title: string;
  description: string | null;
  mode_text: string | null;
  rank_text: string | null;
  region: string | null;
  mic_required: boolean;
  crossplay_enabled: boolean;
  starts_at: string;
  expires_at: string;
  post_status: "open" | "closed" | "cancelled";
  max_players: number;
  current_players: number;
  pending_count: number;
  application_state: ApplicationState;
  is_owner: boolean;
  squad_id: string | null;
  applications: LfgApplication[];
  created_at: string;
};

type FormState = {
  gameKey: string;
  title: string;
  description: string;
  mode: string;
  rank: string;
  region: string;
  micRequired: boolean;
  crossplay: boolean;
  startsAt: string;
  duration: string;
  maxPlayers: string;
};

type LfgBoardProps = {
  session: Session;
  userGames: UserGame[];
  onOpenProfile: (userId: string) => void;
  onOpenMessages: (userId: string) => void;
  onOpenSquads: () => void;
};

export default function LfgBoard({
  session,
  userGames,
  onOpenProfile,
  onOpenMessages,
  onOpenSquads,
}: LfgBoardProps) {
  const primaryGame = userGames.find((game) => game.is_primary) ?? userGames[0] ?? null;
  const primaryGameKey = primaryGame ? userGameKey(primaryGame) : "";
  const [scope, setScope] = useState<Scope>("all");
  const [gameFilter, setGameFilter] = useState("");
  const [posts, setPosts] = useState<LfgPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedApplyId, setExpandedApplyId] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [form, setForm] = useState<FormState>(() => makeInitialForm(primaryGame));

  const filteredGames = useMemo(() => {
    const unique = new Map<string, UserGame>();
    for (const game of userGames) {
      if (!unique.has(game.game_id)) unique.set(game.game_id, game);
    }
    return [...unique.values()];
  }, [userGames]);

  const loadPosts = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    const gameId = gameFilter ? Number(gameFilter) : null;
    const { data, error: loadError } = await supabase.rpc("get_lfg_feed_v8", {
      p_game_id: gameId,
      p_scope: scope,
      p_limit: 80,
    });

    if (loadError) {
      setPosts([]);
      setError(lfgError(loadError.message));
    } else {
      setPosts((data ?? []) as LfgPost[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [gameFilter, scope]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const channel = supabase
      .channel(`gamemate-lfg-v8-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_posts_v8" }, () => {
        void loadPosts(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_applications_v8" }, () => {
        void loadPosts(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadPosts, session.user.id]);

  useEffect(() => {
    if (form.gameKey || !primaryGameKey) return;
    const nextGame = userGames.find((game) => userGameKey(game) === primaryGameKey) ?? null;
    setForm(makeInitialForm(nextGame));
  }, [form.gameKey, primaryGameKey, userGames]);

  function openCreate() {
    setError("");
    setNotice("");
    setForm(makeInitialForm(primaryGame));
    setShowCreate(true);
  }

  function selectFormGame(key: string) {
    const game = userGames.find((item) => userGameKey(item) === key) ?? null;
    setForm((current) => ({
      ...current,
      gameKey: key,
      title: game ? `Recherche de mates sur ${game.gameName}` : current.title,
      mode: game?.mode_text ?? "",
      rank: game?.rank_text ?? "",
      micRequired: game?.mic_enabled ?? false,
      crossplay: game?.crossplay_enabled ?? true,
    }));
  }

  async function createPost() {
    const game = userGames.find((item) => userGameKey(item) === form.gameKey) ?? null;
    if (!game) {
      setError("Choisis un jeu configuré dans ton profil.");
      return;
    }
    if (form.title.trim().length < 4) {
      setError("Ajoute un titre d’au moins 4 caractères.");
      return;
    }

    setBusy("create");
    setError("");
    setNotice("");
    const startsAt = new Date(form.startsAt);
    const { error: createError } = await supabase.rpc("create_lfg_post_v8", {
      p_game_id: Number(game.game_id),
      p_platform_id: game.platform_id ? Number(game.platform_id) : null,
      p_title: form.title.trim(),
      p_description: form.description.trim() || null,
      p_mode_text: form.mode.trim() || null,
      p_rank_text: form.rank.trim() || null,
      p_region: form.region.trim() || null,
      p_mic_required: form.micRequired,
      p_crossplay_enabled: form.crossplay,
      p_starts_at: Number.isNaN(startsAt.getTime()) ? new Date().toISOString() : startsAt.toISOString(),
      p_duration_minutes: Number(form.duration),
      p_max_players: Number(form.maxPlayers),
    });

    if (createError) {
      setError(lfgError(createError.message));
    } else {
      setNotice("Ton annonce est publiée et visible immédiatement.");
      setShowCreate(false);
      setScope("mine");
    }
    setBusy(null);
  }

  async function applyToPost(post: LfgPost) {
    setBusy(`apply-${post.post_id}`);
    setError("");
    setNotice("");
    const { error: applyError } = await supabase.rpc("apply_lfg_post_v8", {
      p_post_id: post.post_id,
      p_message: applyMessage.trim() || null,
    });
    if (applyError) {
      setError(lfgError(applyError.message));
    } else {
      setNotice(`Ta candidature a été envoyée à ${ownerName(post)}.`);
      setExpandedApplyId(null);
      setApplyMessage("");
      await loadPosts(true);
    }
    setBusy(null);
  }

  async function cancelApplication(post: LfgPost) {
    setBusy(`cancel-app-${post.post_id}`);
    setError("");
    const { error: cancelError } = await supabase.rpc("cancel_lfg_application_v8", {
      p_post_id: post.post_id,
    });
    if (cancelError) setError(lfgError(cancelError.message));
    else {
      setNotice("Ta candidature a été retirée.");
      await loadPosts(true);
    }
    setBusy(null);
  }

  async function respond(application: LfgApplication, accept: boolean) {
    setBusy(`${accept ? "accept" : "decline"}-${application.application_id}`);
    setError("");
    setNotice("");
    const { data, error: responseError } = await supabase.rpc("respond_lfg_application_v8", {
      p_application_id: application.application_id,
      p_accept: accept,
    });
    if (responseError) {
      setError(lfgError(responseError.message));
    } else {
      const result = data as { squad_id?: string } | null;
      setNotice(accept
        ? `${applicationName(application)} a rejoint ta squad${result?.squad_id ? "" : "."}`
        : `Candidature de ${applicationName(application)} refusée.`);
      await loadPosts(true);
    }
    setBusy(null);
  }

  async function closePost(post: LfgPost) {
    setBusy(`close-${post.post_id}`);
    setError("");
    const { error: closeError } = await supabase.rpc("close_lfg_post_v8", { p_post_id: post.post_id });
    if (closeError) setError(lfgError(closeError.message));
    else {
      setNotice("L’annonce a été fermée.");
      await loadPosts(true);
    }
    setBusy(null);
  }

  return (
    <section className="lfg8">
      <header className="lfg8-hero">
        <div>
          <span className="lfg8-live"><i /> ANNONCES EN DIRECT</span>
          <h1>Monte une squad <em>maintenant.</em></h1>
          <p>Publie ton besoin ou rejoins une équipe qui joue au même jeu, au même moment.</p>
        </div>
        <button type="button" className="lfg8-create-button" disabled={!userGames.length} onClick={openCreate}>
          <span>＋</span><strong>Créer une annonce</strong><small>Visible en temps réel</small>
        </button>
      </header>

      <div className="lfg8-toolbar">
        <div className="lfg8-scopes" role="tablist" aria-label="Type d’annonces">
          <ScopeButton active={scope === "all"} onClick={() => setScope("all")} label="Toutes" />
          <ScopeButton active={scope === "mine"} onClick={() => setScope("mine")} label="Mes annonces" />
          <ScopeButton active={scope === "applications"} onClick={() => setScope("applications")} label="Mes candidatures" />
        </div>
        <label className="lfg8-game-filter">
          <span>Jeu</span>
          <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)}>
            <option value="">Tous mes jeux</option>
            {filteredGames.map((game) => <option key={game.game_id} value={game.game_id}>{game.gameName}</option>)}
          </select>
        </label>
        <button type="button" className="lfg8-refresh" disabled={refreshing} onClick={() => void loadPosts(true)}>
          {refreshing ? "Actualisation…" : "↻ Actualiser"}
        </button>
      </div>

      {showCreate ? (
        <CreatePanel
          form={form}
          userGames={userGames}
          busy={busy === "create"}
          onChange={setForm}
          onSelectGame={selectFormGame}
          onCancel={() => setShowCreate(false)}
          onSubmit={() => void createPost()}
        />
      ) : null}

      {notice ? <div className="lfg8-feedback success"><span>✓</span>{notice}<button type="button" onClick={() => setNotice("")}>×</button></div> : null}
      {error ? <div className="lfg8-feedback error"><span>!</span>{error}<button type="button" onClick={() => setError("")}>×</button></div> : null}

      {loading ? (
        <div className="lfg8-state"><i className="lfg8-spinner" /><h2>Chargement des annonces…</h2></div>
      ) : posts.length === 0 ? (
        <div className="lfg8-state">
          <span className="lfg8-state-icon">⌁</span>
          <h2>{scope === "all" ? "Aucune annonce active pour le moment." : "Rien à afficher ici."}</h2>
          <p>Sois le premier à proposer une partie : cela prend moins d’une minute.</p>
          {scope === "all" && userGames.length ? <button type="button" onClick={openCreate}>Créer la première annonce</button> : null}
        </div>
      ) : (
        <div className="lfg8-grid">
          {posts.map((post) => (
            <LfgCard
              key={post.post_id}
              post={post}
              busy={busy}
              expandedApply={expandedApplyId === post.post_id}
              applyMessage={applyMessage}
              onApplyMessage={setApplyMessage}
              onToggleApply={() => {
                setExpandedApplyId((current) => current === post.post_id ? null : post.post_id);
                setApplyMessage("");
              }}
              onApply={() => void applyToPost(post)}
              onCancelApplication={() => void cancelApplication(post)}
              onRespond={(application, accept) => void respond(application, accept)}
              onClose={() => void closePost(post)}
              onOpenProfile={onOpenProfile}
              onOpenMessages={onOpenMessages}
              onOpenSquads={onOpenSquads}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ScopeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}>{label}</button>;
}

function CreatePanel({ form, userGames, busy, onChange, onSelectGame, onCancel, onSubmit }: {
  form: FormState;
  userGames: UserGame[];
  busy: boolean;
  onChange: (next: FormState) => void;
  onSelectGame: (key: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => onChange({ ...form, [key]: value });
  return (
    <section className="lfg8-create-panel">
      <header><div><span>NOUVELLE ANNONCE</span><h2>De qui ta squad a-t-elle besoin ?</h2></div><button type="button" onClick={onCancel} aria-label="Fermer">×</button></header>
      <div className="lfg8-form-grid">
        <label><span>Jeu et plateforme</span><select value={form.gameKey} onChange={(event) => onSelectGame(event.target.value)}>{userGames.map((game) => <option key={userGameKey(game)} value={userGameKey(game)}>{game.gameName} · {game.platformName ?? "Plateforme"}</option>)}</select></label>
        <label className="wide"><span>Titre</span><input maxLength={80} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Ex. Recherche 2 joueurs classés" /></label>
        <label className="wide"><span>Description</span><textarea maxLength={320} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Ambiance, objectif, niveau souhaité…" /></label>
        <label><span>Mode</span><input maxLength={60} value={form.mode} onChange={(event) => set("mode", event.target.value)} placeholder="Classé, détente…" /></label>
        <label><span>Rang</span><input maxLength={60} value={form.rank} onChange={(event) => set("rank", event.target.value)} placeholder="Tous niveaux" /></label>
        <label><span>Région</span><input maxLength={60} value={form.region} onChange={(event) => set("region", event.target.value)} placeholder="EU Ouest" /></label>
        <label><span>Début</span><input type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} /></label>
        <label><span>Durée de l’annonce</span><select value={form.duration} onChange={(event) => set("duration", event.target.value)}><option value="30">30 minutes</option><option value="60">1 heure</option><option value="120">2 heures</option><option value="240">4 heures</option><option value="480">8 heures</option></select></label>
        <label><span>Taille finale</span><select value={form.maxPlayers} onChange={(event) => set("maxPlayers", event.target.value)}>{Array.from({ length: 11 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} joueurs</option>)}</select></label>
      </div>
      <div className="lfg8-form-toggles">
        <Toggle checked={form.micRequired} onChange={(value) => set("micRequired", value)} label="Micro obligatoire" />
        <Toggle checked={form.crossplay} onChange={(value) => set("crossplay", value)} label="Crossplay autorisé" />
      </div>
      <footer><span>L’annonce expirera automatiquement.</span><div><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button type="button" disabled={busy} onClick={onSubmit}>{busy ? "Publication…" : "Publier l’annonce"}</button></div></footer>
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" className={checked ? "active" : ""} aria-pressed={checked} onClick={() => onChange(!checked)}><i><b /></i><span>{label}</span></button>;
}

function LfgCard({ post, busy, expandedApply, applyMessage, onApplyMessage, onToggleApply, onApply, onCancelApplication, onRespond, onClose, onOpenProfile, onOpenMessages, onOpenSquads }: {
  post: LfgPost;
  busy: string | null;
  expandedApply: boolean;
  applyMessage: string;
  onApplyMessage: (value: string) => void;
  onToggleApply: () => void;
  onApply: () => void;
  onCancelApplication: () => void;
  onRespond: (application: LfgApplication, accept: boolean) => void;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenMessages: (userId: string) => void;
  onOpenSquads: () => void;
}) {
  const full = post.current_players >= post.max_players;
  const pendingApplications = post.applications.filter((application) => application.status === "pending");
  const active = post.post_status === "open" && new Date(post.expires_at).getTime() > Date.now();
  return (
    <article className={`lfg8-card ${post.is_owner ? "owner" : ""} ${active ? "" : "closed"}`}>
      <header>
        <button type="button" className="lfg8-owner" onClick={() => onOpenProfile(post.owner_id)}>
          <span>{post.owner_avatar_url ? <img src={post.owner_avatar_url} alt="" /> : ownerName(post).slice(0, 1).toUpperCase()}</span>
          <span><strong>{ownerName(post)}</strong><small>{post.is_owner ? "Ton annonce" : `@${post.owner_username ?? "joueur"}`}</small></span>
        </button>
        <span className="lfg8-count"><b>{post.current_players}</b>/{post.max_players}<small>joueurs</small></span>
      </header>
      <div className="lfg8-card-game"><span>{post.game_logo_url ? <img src={post.game_logo_url} alt="" /> : post.game_name.slice(0, 2).toUpperCase()}</span><div><small>PARTIE PRÉVUE</small><strong>{post.game_name}</strong></div><time>{timeLabel(post.starts_at)}</time></div>
      <h2>{post.title}</h2>
      <p>{post.description || "Aucune description supplémentaire."}</p>
      <div className="lfg8-tags">
        {post.platform_name ? <span>{post.platform_name}</span> : null}
        {post.mode_text ? <span>{post.mode_text}</span> : null}
        {post.rank_text ? <span>{post.rank_text}</span> : null}
        {post.region ? <span>⌖ {post.region}</span> : null}
        {post.mic_required ? <span>● Micro</span> : null}
        {post.crossplay_enabled ? <span>↔ Crossplay</span> : null}
      </div>
      <div className="lfg8-progress"><i style={{ width: `${Math.min(100, (post.current_players / post.max_players) * 100)}%` }} /><span>{full ? "Squad complète" : `${post.max_players - post.current_players} place(s) disponible(s)`}</span><time>Expire {relativeExpiry(post.expires_at)}</time></div>

      {post.is_owner && pendingApplications.length ? (
        <section className="lfg8-applications">
          <header><strong>Candidatures</strong><span>{pendingApplications.length} en attente</span></header>
          {pendingApplications.map((application) => (
            <div key={application.application_id} className="lfg8-applicant">
              <button type="button" className="identity" onClick={() => onOpenProfile(application.applicant_id)}>
                <span>{application.avatar_url ? <img src={application.avatar_url} alt="" /> : applicationName(application).slice(0, 1).toUpperCase()}</span>
                <span><strong>{applicationName(application)}</strong><small>{application.message || "Souhaite rejoindre la partie"}</small></span>
              </button>
              <div><button type="button" className="decline" disabled={busy === `decline-${application.application_id}`} onClick={() => onRespond(application, false)}>Refuser</button><button type="button" disabled={busy === `accept-${application.application_id}`} onClick={() => onRespond(application, true)}>{busy === `accept-${application.application_id}` ? "Ajout…" : "Accepter"}</button></div>
            </div>
          ))}
        </section>
      ) : null}

      {expandedApply && post.application_state === "none" ? (
        <div className="lfg8-apply-box"><textarea maxLength={180} value={applyMessage} onChange={(event) => onApplyMessage(event.target.value)} placeholder="Petit message pour le chef de squad (facultatif)…" /><div><button type="button" className="secondary" onClick={onToggleApply}>Annuler</button><button type="button" disabled={busy === `apply-${post.post_id}`} onClick={onApply}>{busy === `apply-${post.post_id}` ? "Envoi…" : "Envoyer ma candidature"}</button></div></div>
      ) : null}

      <footer>
        <div><button type="button" className="link" onClick={() => onOpenProfile(post.owner_id)}>Profil</button>{!post.is_owner ? <button type="button" className="link" onClick={() => onOpenMessages(post.owner_id)}>Message</button> : null}</div>
        <div>
          {post.is_owner ? <>{active ? <button type="button" className="secondary" disabled={busy === `close-${post.post_id}`} onClick={onClose}>Fermer</button> : <span className="lfg8-status declined">Annonce terminée</span>}{post.squad_id ? <button type="button" onClick={onOpenSquads}>Ouvrir la squad</button> : null}</> : null}
          {!post.is_owner && post.application_state === "none" && !expandedApply && !full && active ? <button type="button" onClick={onToggleApply}>Candidater</button> : null}
          {!post.is_owner && post.application_state === "pending" ? <button type="button" className="secondary" disabled={busy === `cancel-app-${post.post_id}`} onClick={onCancelApplication}>Retirer ma demande</button> : null}
          {!post.is_owner && post.application_state === "accepted" ? <button type="button" onClick={onOpenSquads}>Ouvrir ma squad</button> : null}
          {!post.is_owner && post.application_state === "declined" ? <span className="lfg8-status declined">Non retenu</span> : null}
        </div>
      </footer>
    </article>
  );
}

function makeInitialForm(game: UserGame | null): FormState {
  return {
    gameKey: game ? userGameKey(game) : "",
    title: game ? `Recherche de mates sur ${game.gameName}` : "",
    description: "",
    mode: game?.mode_text ?? "",
    rank: game?.rank_text ?? "",
    region: "",
    micRequired: game?.mic_enabled ?? false,
    crossplay: game?.crossplay_enabled ?? true,
    startsAt: toLocalDateTime(new Date()),
    duration: "120",
    maxPlayers: "5",
  };
}

function userGameKey(game: Pick<UserGame, "game_id" | "platform_id">) {
  return `${game.game_id}:${game.platform_id ?? "none"}`;
}

function ownerName(post: LfgPost) {
  return post.owner_display_name || post.owner_username || "Joueur GameMate";
}

function applicationName(application: LfgApplication) {
  return application.display_name || application.username || "Joueur GameMate";
}

function toLocalDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return `${sameDay ? "Aujourd’hui" : date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} · ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function relativeExpiry(value: string) {
  const minutes = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `dans ${hours} h`;
}

function lfgError(message?: string) {
  if (!message) return "Une erreur empêche l’action pour le moment.";
  const errors: Record<string, string> = {
    authentication_required: "Reconnecte-toi pour utiliser les annonces.",
    game_not_configured: "Ajoute ce jeu et cette plateforme à ton profil.",
    active_post_exists_for_game: "Tu as déjà une annonce active pour ce jeu.",
    only_squad_owner_can_publish: "Seul le chef de ta squad peut publier une annonce.",
    already_in_active_squad: "Tu fais déjà partie d’une squad active.",
    applicant_already_in_squad: "Ce joueur a déjà rejoint une autre squad.",
    owner_already_in_another_squad: "Ta squad active ne correspond plus à cette annonce.",
    post_closed: "Cette annonce est terminée ou complète.",
    post_full: "La squad est déjà complète.",
    user_blocked: "Cette action est impossible entre ces deux comptes.",
    invalid_start_time: "Choisis une heure comprise entre maintenant et les 30 prochains jours.",
  };
  const key = Object.keys(errors).find((item) => message.includes(item));
  return key ? errors[key] : message;
}
