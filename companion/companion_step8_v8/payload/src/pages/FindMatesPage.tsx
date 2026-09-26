import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import LfgBoard from "../components/LfgBoard";
import "./FindMatesPage.css";

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

type GamingDnaTag = { id: string; name: string; category: string };
type LookingForOption = { id: string; label: string; slug: string };
type AvailabilityRow = { day_of_week: number; start_time: string; end_time: string; timezone: string };
type SortMode = "compatibility" | "online" | "name";
type DiscoveryMode = "matching" | "live";
type FriendshipState = "none" | "pending_outgoing" | "pending_incoming" | "accepted";

type FindMatesProps = {
  session: Session | null;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  lookingFor: LookingForOption[];
  availability: AvailabilityRow[];
  profileCompletion?: number;
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenMessages: (userId: string) => void;
  onOpenFriends: () => void;
  onOpenSquads: () => void;
  onOpenSettings?: () => void;
};

type MatchReason = {
  label: string;
  detail: string | null;
  points: number;
};

type AvailabilitySummary = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type MateProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
  game_id: number;
  platform_id: number | null;
  game_name: string;
  game_logo_url: string | null;
  game_cover_url: string | null;
  platform_name: string | null;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean;
  crossplay_enabled: boolean;
  is_primary: boolean;
  compatibility_score: number;
  compatibility_level: "ideal" | "strong" | "promising" | "possible";
  match_reasons: MatchReason[];
  shared_dna_count: number;
  shared_looking_for_count: number;
  availability_match: boolean;
  availability_summary: AvailabilitySummary | null;
  presence_status: "online" | "busy" | "offline";
  last_seen_at: string | null;
  friendship_id: string | null;
  friendship_state: FriendshipState;
  can_invite: boolean;
  squad_invite_pending: boolean;
  target_in_squad: boolean;
  viewer_squad_game_id: number | null;
};

export default function FindMatesPage({
  session,
  userGames,
  gamingDna,
  lookingFor,
  availability,
  profileCompletion = 0,
  onLogin,
  onOpenProfile,
  onOpenMessages,
  onOpenFriends,
  onOpenSquads,
  onOpenSettings,
}: FindMatesProps) {
  const primaryGame = userGames.find((game) => game.is_primary) ?? userGames[0] ?? null;
  const primaryGameKey = primaryGame ? userGameKey(primaryGame) : "";
  const primaryGameCrossplay = primaryGame?.crossplay_enabled ?? true;
  const [selectedGameKey, setSelectedGameKey] = useState("");
  const [micOnly, setMicOnly] = useState(false);
  const [crossplay, setCrossplay] = useState(true);
  const [sameRank, setSameRank] = useState(false);
  const [sameRole, setSameRole] = useState(false);
  const [sameMode, setSameMode] = useState(false);
  const [sameLanguage, setSameLanguage] = useState(false);
  const [sameRegion, setSameRegion] = useState(false);
  const [commonAvailability, setCommonAvailability] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("compatibility");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [results, setResults] = useState<MateProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>("matching");

  const selectedGame =
    userGames.find((game) => userGameKey(game) === selectedGameKey) ?? primaryGame ?? null;

  useEffect(() => {
    if (selectedGameKey || !primaryGameKey) return;
    setSelectedGameKey(primaryGameKey);
    setCrossplay(primaryGameCrossplay);
  }, [primaryGameCrossplay, primaryGameKey, selectedGameKey]);

  const activeFilterCount = [
    micOnly,
    !crossplay,
    sameRank,
    sameRole,
    sameMode,
    sameLanguage,
    sameRegion,
    commonAvailability,
    Boolean(query.trim()),
  ].filter(Boolean).length;

  const sortedResults = useMemo(() => {
    const next = [...results];
    if (sortMode === "online") {
      const presenceWeight = { online: 0, busy: 1, offline: 2 };
      return next.sort((a, b) =>
        presenceWeight[a.presence_status] - presenceWeight[b.presence_status]
        || b.compatibility_score - a.compatibility_score
      );
    }
    if (sortMode === "name") {
      return next.sort((a, b) =>
        mateName(a).localeCompare(mateName(b), "fr", { sensitivity: "base" })
      );
    }
    return next.sort((a, b) => b.compatibility_score - a.compatibility_score);
  }, [results, sortMode]);

  function selectGame(game: UserGame) {
    setSelectedGameKey(userGameKey(game));
    setCrossplay(game.crossplay_enabled);
    setSameRank(false);
    setSameRole(false);
    setSameMode(false);
    setResults([]);
    setSearched(false);
    setError("");
    setNotice("");
  }

  async function searchMates(silent = false) {
    if (!session) {
      onLogin();
      return;
    }
    if (!selectedGame) {
      setError("Ajoute au moins un jeu à ton profil avant de rechercher des mates.");
      return;
    }

    const gameId = Number(selectedGame.game_id);
    const platformId = selectedGame.platform_id ? Number(selectedGame.platform_id) : null;
    if (!Number.isFinite(gameId)) {
      setError("Le jeu sélectionné possède un identifiant invalide.");
      return;
    }

    if (!silent) setLoading(true);
    setError("");
    setNotice("");
    setSearched(true);

    const { data, error: rpcError } = await supabase.rpc("find_mates_smart_v7", {
      p_game_id: gameId,
      p_platform_id: platformId,
      p_allow_crossplay: crossplay,
      p_mic_required: micOnly,
      p_same_rank: sameRank,
      p_same_role: sameRole,
      p_same_mode: sameMode,
      p_same_language: sameLanguage,
      p_same_region: sameRegion,
      p_availability_required: commonAvailability,
      p_query: query.trim() || null,
      p_limit: 60,
    });

    if (rpcError) {
      console.error("Find Mates / find_mates_smart_v7:", rpcError);
      setResults([]);
      setError(matchError(rpcError.message));
      setLoading(false);
      return;
    }

    setResults((data ?? []) as MateProfile[]);
    setLoading(false);
  }

  async function runMateAction(
    mate: MateProfile,
    key: string,
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success: string
  ) {
    setActionBusy(`${key}-${mate.user_id}`);
    setError("");
    setNotice("");
    const result = await action();
    if (result.error) {
      setError(matchError(result.error.message));
    } else {
      setNotice(success);
      await searchMates(true);
    }
    setActionBusy(null);
  }

  function sendFriendRequest(mate: MateProfile) {
    return runMateAction(
      mate,
      "friend",
      () => supabase.rpc("send_friend_request", { p_target_user_id: mate.user_id }),
      `Demande envoyée à ${mateName(mate)}.`
    );
  }

  function acceptFriendRequest(mate: MateProfile) {
    if (!mate.friendship_id) return Promise.resolve();
    return runMateAction(
      mate,
      "accept",
      () => supabase.rpc("respond_friend_request", {
        p_request_id: mate.friendship_id,
        p_accept: true,
      }),
      `${mateName(mate)} fait maintenant partie de tes amis.`
    );
  }

  function inviteToSquad(mate: MateProfile) {
    return runMateAction(
      mate,
      "squad",
      () => supabase.rpc("invite_to_squad", {
        p_recipient_id: mate.user_id,
        p_game_id: mate.viewer_squad_game_id,
      }),
      `Invitation de squad envoyée à ${mateName(mate)}.`
    );
  }

  function resetFilters() {
    setMicOnly(false);
    setCrossplay(selectedGame?.crossplay_enabled ?? true);
    setSameRank(false);
    setSameRole(false);
    setSameMode(false);
    setSameLanguage(false);
    setSameRegion(false);
    setCommonAvailability(false);
    setQuery("");
    setResults([]);
    setSearched(false);
    setError("");
    setNotice("");
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void searchMates();
  }

  if (!session) {
    return (
      <section className="fmx-locked">
        <div className="fmx-lock-visual"><span>⌁</span></div>
        <div>
          <span className="fmx-eyebrow">DÉCOUVERTE GAMEMATE</span>
          <h1>Tes prochains mates sont peut-être déjà là.</h1>
          <p>Connecte-toi pour explorer de vrais profils selon tes jeux et ta façon de jouer.</p>
          <button type="button" onClick={onLogin}>Se connecter</button>
        </div>
      </section>
    );
  }

  return (
    <div className="fmx fmx-v7 fmx-v8">
      <nav className="fmx-mode-switch" aria-label="Mode de recherche">
        <button type="button" className={discoveryMode === "matching" ? "active" : ""} onClick={() => setDiscoveryMode("matching")}>
          <span>✦</span><span><strong>Matching intelligent</strong><small>Profils compatibles</small></span>
        </button>
        <button type="button" className={discoveryMode === "live" ? "active" : ""} onClick={() => setDiscoveryMode("live")}>
          <span className="live-dot">●</span><span><strong>Annonces en direct</strong><small>Jouer maintenant</small></span>
        </button>
      </nav>

      {discoveryMode === "live" ? (
        <LfgBoard
          session={session}
          userGames={userGames}
          onOpenProfile={onOpenProfile}
          onOpenMessages={onOpenMessages}
          onOpenSquads={onOpenSquads}
        />
      ) : (
        <>
      <header className="fmx-hero">
        <div className="fmx-hero-copy">
          <span className="fmx-eyebrow">SMART MATCHING · V7</span>
          <h1>Trouve les joueurs qui <em>te correspondent vraiment.</em></h1>
          <p>Chaque score est calculé avec vos jeux, styles, intentions et créneaux réellement renseignés.</p>
        </div>

        <button className="fmx-profile-health" type="button" onClick={onOpenSettings}>
          <span className="fmx-health-ring" style={{ "--progress": `${profileCompletion * 3.6}deg` } as CSSProperties}>
            <strong>{profileCompletion}%</strong>
          </span>
          <span>
            <small>QUALITÉ DU MATCHING</small>
            <strong>{profileCompletion >= 80 ? "Profil prêt" : "Profil à compléter"}</strong>
            <em>Plus ton profil est précis, plus le score est utile.</em>
          </span>
          <b>›</b>
        </button>
      </header>

      <section className="fmx-game-strip">
        <div className="fmx-strip-label">
          <span className="fmx-eyebrow">01 · CHOISIS TON JEU</span>
          <strong>{selectedGame?.gameName ?? "Aucun jeu configuré"}</strong>
        </div>
        <div className="fmx-games">
          {userGames.map((game, index) => (
            <button
              type="button"
              key={`${game.game_id}-${game.platform_id ?? "none"}`}
              className={userGameKey(game) === (selectedGame ? userGameKey(selectedGame) : "") ? "active" : ""}
              onClick={() => selectGame(game)}
            >
              <span className={`fmx-game-art tone-${index % 4}`}>{game.gameName.slice(0, 2).toUpperCase()}</span>
              <span><strong>{game.gameName}</strong><small>{game.platformName ?? "Plateforme inconnue"}</small></span>
              {game.is_primary ? <i>Principal</i> : null}
            </button>
          ))}
        </div>
      </section>

      <div className="fmx-workspace">
        <aside className="fmx-filter-panel">
          <div className="fmx-panel-head">
            <div><span className="fmx-eyebrow">02 · TES CRITÈRES</span><h2>Filtres intelligents</h2></div>
            {activeFilterCount > 0 ? <b>{activeFilterCount}</b> : null}
          </div>

          <label className="fmx-query">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleQueryKeyDown}
              placeholder="Pseudo, région, rôle…"
            />
          </label>

          <div className="fmx-quick-filters">
            <FilterToggle
              icon="◉"
              title="Micro obligatoire"
              description="Uniquement les joueurs avec micro."
              checked={micOnly}
              onChange={setMicOnly}
            />
            <FilterToggle
              icon="↔"
              title="Crossplay autorisé"
              description="Inclure les autres plateformes compatibles."
              checked={crossplay}
              onChange={setCrossplay}
            />
          </div>

          <button className="fmx-advanced-trigger" type="button" onClick={() => setShowAdvanced((value) => !value)}>
            <span>Critères avancés</span><b>{showAdvanced ? "−" : "+"}</b>
          </button>

          {showAdvanced ? (
            <div className="fmx-advanced">
              <FilterToggle
                icon="◆"
                title="Même rang"
                description={selectedGame?.rank_text ? selectedGame.rank_text : "Renseigne ton rang dans le profil."}
                checked={sameRank}
                onChange={setSameRank}
                disabled={!selectedGame?.rank_text}
              />
              <FilterToggle
                icon="◇"
                title="Même rôle"
                description={selectedGame?.role_text ? selectedGame.role_text : "Renseigne ton rôle dans le profil."}
                checked={sameRole}
                onChange={setSameRole}
                disabled={!selectedGame?.role_text}
              />
              <FilterToggle
                icon="▣"
                title="Même mode"
                description={selectedGame?.mode_text ? selectedGame.mode_text : "Renseigne ton mode dans le profil."}
                checked={sameMode}
                onChange={setSameMode}
                disabled={!selectedGame?.mode_text}
              />
              <FilterToggle icon="◈" title="Même langue" description="Communication plus simple." checked={sameLanguage} onChange={setSameLanguage} />
              <FilterToggle icon="⌖" title="Même région" description="Fuseau et serveurs proches." checked={sameRegion} onChange={setSameRegion} />
              <FilterToggle
                icon="◷"
                title="Créneau en commun"
                description={availability.length ? `${availability.length} créneau(x) configuré(s).` : "Ajoute tes disponibilités dans le profil."}
                checked={commonAvailability}
                onChange={setCommonAvailability}
                disabled={availability.length === 0}
              />
            </div>
          ) : null}

          <div className="fmx-profile-signals">
            <span><b>{gamingDna.length}</b> traits DNA</span>
            <span><b>{lookingFor.length}</b> intentions</span>
            <span><b>{availability.length}</b> créneaux</span>
          </div>

          <button className="fmx-search-button" type="button" disabled={!selectedGame || loading} onClick={() => void searchMates()}>
            <span>{loading ? "Calcul des compatibilités…" : "Trouver mes meilleurs mates"}</span><b>→</b>
          </button>
          {activeFilterCount > 0 ? (
            <button className="fmx-reset" type="button" onClick={resetFilters}>Réinitialiser les filtres</button>
          ) : null}
        </aside>

        <main className="fmx-results">
          <div className="fmx-results-head">
            <div>
              <span className="fmx-eyebrow">03 · RÉSULTATS EXPLIQUÉS</span>
              <h2>
                {searched
                  ? `${results.length} profil${results.length > 1 ? "s" : ""} compatible${results.length > 1 ? "s" : ""}`
                  : "Prêt à calculer les compatibilités"}
              </h2>
            </div>
            {searched && results.length > 1 ? (
              <label className="fmx-sort">
                <span>Trier par</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="compatibility">Meilleur score</option>
                  <option value="online">En ligne d’abord</option>
                  <option value="name">Nom</option>
                </select>
              </label>
            ) : selectedGame ? (
              <span className="fmx-search-context">
                <i>{selectedGame.gameName.slice(0, 2).toUpperCase()}</i>
                <span><small>RECHERCHE ACTUELLE</small><strong>{selectedGame.gameName}</strong></span>
              </span>
            ) : null}
          </div>

          {notice ? <div className="fmx-notice">{notice}</div> : null}
          {error ? <div className="fmx-error"><span>{error}</span><button type="button" onClick={() => void searchMates()}>Réessayer</button></div> : null}

          {!searched ? (
            <DiscoveryState game={selectedGame} onSearch={() => void searchMates()} />
          ) : loading ? (
            <div className="fmx-state">
              <span className="fmx-loader" />
              <h3>Calcul des compatibilités…</h3>
              <p>GameMate compare uniquement les informations réellement renseignées et visibles.</p>
            </div>
          ) : sortedResults.length === 0 ? (
            <div className="fmx-state">
              <span className="fmx-state-icon">⌁</span>
              <h3>Aucun mate avec ces critères.</h3>
              <p>Élargis les filtres ou active le crossplay pour voir davantage de profils.</p>
              <button type="button" onClick={resetFilters}>Élargir la recherche</button>
            </div>
          ) : (
            <div className="fmx-card-grid">
              {sortedResults.map((mate) => (
                <MateCard
                  key={mate.user_id}
                  mate={mate}
                  busy={actionBusy}
                  onOpenProfile={() => onOpenProfile(mate.user_id)}
                  onOpenMessages={() => onOpenMessages(mate.user_id)}
                  onOpenFriends={onOpenFriends}
                  onOpenSquads={onOpenSquads}
                  onSendFriend={() => void sendFriendRequest(mate)}
                  onAcceptFriend={() => void acceptFriendRequest(mate)}
                  onInviteSquad={() => void inviteToSquad(mate)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
        </>
      )}
    </div>
  );
}

function FilterToggle({ icon, title, description, checked, onChange, disabled = false }: {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`fmx-toggle ${checked ? "active" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="fmx-toggle-icon">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <i><b /></i>
    </button>
  );
}

function DiscoveryState({ game, onSearch }: { game: UserGame | null; onSearch: () => void }) {
  return (
    <div className="fmx-discovery-state">
      <div className="fmx-radar"><span /><i /><b /><img src="/gamemate-logo.png" alt="" /></div>
      <span className="fmx-eyebrow">MOTEUR DE MATCHING PRÊT</span>
      <h3>{game ? `Qui te correspond sur ${game.gameName} ?` : "Configure ton premier jeu"}</h3>
      <p>Le score repose uniquement sur de vrais comptes et des informations configurées dans les profils.</p>
      {game ? <button type="button" onClick={onSearch}>Calculer mes compatibilités</button> : null}
    </div>
  );
}

function MateCard({
  mate,
  busy,
  onOpenProfile,
  onOpenMessages,
  onOpenFriends,
  onOpenSquads,
  onSendFriend,
  onAcceptFriend,
  onInviteSquad,
}: {
  mate: MateProfile;
  busy: string | null;
  onOpenProfile: () => void;
  onOpenMessages: () => void;
  onOpenFriends: () => void;
  onOpenSquads: () => void;
  onSendFriend: () => void;
  onAcceptFriend: () => void;
  onInviteSquad: () => void;
}) {
  const name = mateName(mate);
  const levelLabel = {
    ideal: "Match idéal",
    strong: "Très compatible",
    promising: "Bon potentiel",
    possible: "Compatible",
  }[mate.compatibility_level];
  const scoreStyle = { "--match-score": `${mate.compatibility_score * 3.6}deg` } as CSSProperties;
  const availabilityLabel = formatAvailability(mate.availability_summary);

  return (
    <article className={`fmx-card match-${mate.compatibility_level}`}>
      <div className="fmx-card-accent" />
      <div className="fmx-card-top">
        <div className="fmx-avatar">
          {mate.avatar_url ? <img src={mate.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}
          <i className={`fmx-presence ${mate.presence_status}`} title={presenceLabel(mate.presence_status)} />
        </div>
        <div className="fmx-identity">
          <strong>{name}</strong>
          <span>{mate.username ? `@${mate.username}` : "Profil GameMate"}</span>
          <small>{presenceLabel(mate.presence_status)}</small>
        </div>
        <div className="fmx-score" style={scoreStyle}>
          <span><strong>{mate.compatibility_score}%</strong><small>{levelLabel}</small></span>
        </div>
      </div>

      <div className="fmx-platform-line">
        <span>{mate.platform_name ?? "Plateforme non renseignée"}</span>
        {mate.mic_enabled ? <span>● Micro</span> : null}
        {mate.crossplay_enabled ? <span>↔ Crossplay</span> : null}
      </div>

      <p className="fmx-bio">{mate.bio || "Présentation non renseignée ou privée."}</p>

      <div className="fmx-card-meta">
        {mate.rank_text ? <Meta label="Rang" value={mate.rank_text} /> : null}
        {mate.role_text ? <Meta label="Rôle" value={mate.role_text} /> : null}
        {mate.mode_text ? <Meta label="Mode" value={mate.mode_text} /> : null}
      </div>

      {availabilityLabel ? <div className="fmx-common-slot"><span>◷</span><strong>Créneau commun</strong><small>{availabilityLabel}</small></div> : null}

      <div className="fmx-reasons">
        {mate.match_reasons.slice(0, 4).map((reason) => (
          <span key={reason.label}>✓ {reason.label}</span>
        ))}
      </div>

      <details className="fmx-score-details">
        <summary>Pourquoi {mate.compatibility_score}% ?</summary>
        <div>
          {mate.match_reasons.map((reason) => (
            <span key={reason.label}>
              <span><strong>{reason.label}</strong><small>{reason.detail || "Critère compatible"}</small></span>
              <b>+{reason.points}</b>
            </span>
          ))}
        </div>
      </details>

      <div className="fmx-social-actions">
        <FriendAction
          mate={mate}
          busy={busy}
          onMessage={onOpenMessages}
          onOpenFriends={onOpenFriends}
          onSend={onSendFriend}
          onAccept={onAcceptFriend}
        />
        {mate.target_in_squad ? (
          <button type="button" className="subtle" onClick={onOpenSquads}>Dans ta squad</button>
        ) : mate.squad_invite_pending ? (
          <button type="button" className="subtle" onClick={onOpenSquads}>Invitation envoyée</button>
        ) : mate.can_invite ? (
          <button type="button" disabled={busy === `squad-${mate.user_id}`} onClick={onInviteSquad}>
            {busy === `squad-${mate.user_id}` ? "Invitation…" : "Inviter"}
          </button>
        ) : null}
        <button type="button" className="profile" onClick={onOpenProfile}>Profil →</button>
      </div>
    </article>
  );
}

function FriendAction({
  mate,
  busy,
  onMessage,
  onOpenFriends,
  onSend,
  onAccept,
}: {
  mate: MateProfile;
  busy: string | null;
  onMessage: () => void;
  onOpenFriends: () => void;
  onSend: () => void;
  onAccept: () => void;
}) {
  if (mate.friendship_state === "accepted") {
    return <button type="button" className="primary" onClick={onMessage}>Message</button>;
  }
  if (mate.friendship_state === "pending_incoming") {
    return (
      <button type="button" className="primary" disabled={busy === `accept-${mate.user_id}`} onClick={onAccept}>
        {busy === `accept-${mate.user_id}` ? "Validation…" : "Accepter"}
      </button>
    );
  }
  if (mate.friendship_state === "pending_outgoing") {
    return <button type="button" className="subtle" onClick={onOpenFriends}>Demande envoyée</button>;
  }
  return (
    <button type="button" className="primary" disabled={busy === `friend-${mate.user_id}`} onClick={onSend}>
      {busy === `friend-${mate.user_id}` ? "Envoi…" : "+ Ami"}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function mateName(mate: Pick<MateProfile, "display_name" | "username">) {
  return mate.display_name || mate.username || "Joueur GameMate";
}

function userGameKey(game: Pick<UserGame, "game_id" | "platform_id">) {
  return `${game.game_id}:${game.platform_id ?? "none"}`;
}

function presenceLabel(status: MateProfile["presence_status"]) {
  if (status === "online") return "En ligne";
  if (status === "busy") return "Occupé";
  return "Hors ligne";
}

function formatAvailability(slot: AvailabilitySummary | null) {
  if (!slot) return "";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const start = slot.start_time.slice(0, 5).replace(":", "h");
  const end = slot.end_time.slice(0, 5).replace(":", "h");
  return `${days[slot.day_of_week] ?? "Jour"} · ${start}–${end}`;
}

function matchError(message?: string) {
  if (!message) return "Impossible de calculer les compatibilités pour le moment.";
  if (message.includes("authentication_required")) return "Connecte-toi pour rechercher des mates.";
  if (message.includes("game_not_configured")) return "Ce jeu n’est pas correctement configuré dans ton profil.";
  if (message.includes("friend_requests_disabled")) return "Ce joueur n’accepte pas les demandes d’ami.";
  if (message.includes("squad_invites_disabled")) return "Ce joueur n’accepte pas les invitations de squad.";
  return message;
}
