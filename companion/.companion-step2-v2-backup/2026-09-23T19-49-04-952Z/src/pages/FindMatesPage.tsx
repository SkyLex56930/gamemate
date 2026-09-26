import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
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

type FindMatesProps = {
  session: Session | null;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  lookingFor: LookingForOption[];
  profileCompletion?: number;
  profileRegion?: string | null;
  profileLanguage?: string | null;
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenSettings?: () => void;
  onOpenMessages?: (userId: string) => void;
  onOpenFriends?: () => void;
  onOpenSquads?: () => void;
};

type MateProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
  game_id: string | number | null;
  game_name: string | null;
  platform_name: string | null;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean | null;
  crossplay_enabled: boolean | null;
  is_primary: boolean | null;
};

type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  status: string;
};

type Relationship = "none" | "sent" | "received" | "friends";
type SortMode = "compatibility" | "name";

type Compatibility = {
  score: number;
  reasons: string[];
};

export default function FindMatesPage({
  session,
  userGames,
  gamingDna,
  lookingFor,
  profileCompletion = 0,
  profileRegion = null,
  profileLanguage = null,
  onLogin,
  onOpenProfile,
  onOpenSettings,
  onOpenMessages,
  onOpenFriends,
  onOpenSquads,
}: FindMatesProps) {
  const primaryGame = useMemo(
    () => userGames.find((game) => game.is_primary) ?? userGames[0] ?? null,
    [userGames]
  );

  const [selectedGameId, setSelectedGameId] = useState("");
  const [micOnly, setMicOnly] = useState(false);
  const [crossplay, setCrossplay] = useState(true);
  const [sameRank, setSameRank] = useState(false);
  const [sameRole, setSameRole] = useState(false);
  const [sameRegion, setSameRegion] = useState(false);
  const [sameLanguage, setSameLanguage] = useState(false);
  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("compatibility");
  const [rawResults, setRawResults] = useState<MateProfile[]>([]);
  const [relationships, setRelationships] = useState<Record<string, Relationship>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [errorAction, setErrorAction] = useState<"search" | "squads" | null>(null);

  useEffect(() => {
    if (!primaryGame) return;
    const selectedStillExists = userGames.some((game) => game.game_id === selectedGameId);
    if (!selectedStillExists) {
      setSelectedGameId(primaryGame.game_id);
      setCrossplay(primaryGame.crossplay_enabled);
    }
  }, [primaryGame, selectedGameId, userGames]);

  const selectedGame =
    userGames.find((game) => game.game_id === selectedGameId) ?? primaryGame ?? null;

  const activeFilterCount = [
    micOnly,
    !crossplay,
    sameRank,
    sameRole,
    sameRegion,
    sameLanguage,
    Boolean(query.trim()),
  ].filter(Boolean).length;

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const unique = new Map<string, MateProfile>();

    for (const candidate of rawResults) {
      if (micOnly && !candidate.mic_enabled) continue;
      if (!crossplay && selectedGame?.platformName && candidate.platform_name !== selectedGame.platformName) continue;
      if (sameRank && selectedGame?.rank_text && candidate.rank_text !== selectedGame.rank_text) continue;
      if (sameRole && selectedGame?.role_text && candidate.role_text !== selectedGame.role_text) continue;
      if (sameRegion && profileRegion && normalize(candidate.region) !== normalize(profileRegion)) continue;
      if (sameLanguage && profileLanguage && normalize(candidate.language) !== normalize(profileLanguage)) continue;

      if (normalizedQuery) {
        const searchable = [
          candidate.display_name,
          candidate.username,
          candidate.region,
          candidate.language,
          candidate.rank_text,
          candidate.role_text,
          candidate.mode_text,
          candidate.platform_name,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!searchable.includes(normalizedQuery)) continue;
      }

      const previous = unique.get(candidate.user_id);
      if (!previous || getCompatibility(candidate, selectedGame, profileRegion, profileLanguage).score >
        getCompatibility(previous, selectedGame, profileRegion, profileLanguage).score) {
        unique.set(candidate.user_id, candidate);
      }
    }

    return [...unique.values()].sort((a, b) => {
      if (sortMode === "name") return mateName(a).localeCompare(mateName(b), "fr");
      return getCompatibility(b, selectedGame, profileRegion, profileLanguage).score -
        getCompatibility(a, selectedGame, profileRegion, profileLanguage).score;
    });
  }, [crossplay, micOnly, profileLanguage, profileRegion, query, rawResults, sameLanguage, sameRank, sameRegion, sameRole, selectedGame, sortMode]);

  function selectGame(game: UserGame) {
    setSelectedGameId(game.game_id);
    setCrossplay(game.crossplay_enabled);
    setRawResults([]);
    setRelationships({});
    setSearched(false);
    setError("");
    setNotice("");
    setErrorAction(null);
  }

  const loadRelationships = useCallback(async (candidates: MateProfile[]) => {
    const userId = session?.user?.id;
    if (!userId || candidates.length === 0) {
      setRelationships({});
      return;
    }

    const candidateIds = new Set(candidates.map((candidate) => candidate.user_id));
    const { data, error: relationError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (relationError) {
      console.error("Find Mates / friendships:", relationError);
      return;
    }

    const next: Record<string, Relationship> = {};
    for (const row of (data ?? []) as FriendshipRow[]) {
      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      if (!candidateIds.has(otherId)) continue;
      if (row.status !== "pending" && row.status !== "accepted") continue;
      next[otherId] = row.status === "accepted"
        ? "friends"
        : row.requester_id === userId ? "sent" : "received";
    }
    setRelationships(next);
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || rawResults.length === 0) return;

    const refreshRelationships = () => {
      void loadRelationships(rawResults);
    };

    const channel = supabase
      .channel(`find-mates-social:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        (payload) => {
          const next = payload.new as { requester_id?: string; addressee_id?: string } | null;
          const previous = payload.old as { requester_id?: string; addressee_id?: string } | null;
          const concernsUser =
            next?.requester_id === userId ||
            next?.addressee_id === userId ||
            previous?.requester_id === userId ||
            previous?.addressee_id === userId;
          if (concernsUser) refreshRelationships();
        }
      )
      .subscribe();

    const onSocialRefresh = () => refreshRelationships();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshRelationships();
    };

    window.addEventListener("gamemate:social-refresh", onSocialRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("gamemate:social-refresh", onSocialRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [loadRelationships, rawResults, session?.user?.id]);

  async function searchMates() {
    if (!session) {
      onLogin();
      return;
    }
    if (!selectedGame) {
      setError("Ajoute d’abord un jeu depuis ton profil. Cela ne bloque plus ton inscription.");
      setErrorAction(null);
      return;
    }

    const gameId = Number(selectedGame.game_id);
    if (!Number.isFinite(gameId)) {
      setError("Le jeu sélectionné possède un identifiant invalide.");
      setErrorAction(null);
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    setErrorAction(null);
    setSearched(true);

    const { data, error: rpcError } = await supabase.rpc("find_mates_profiles", {
      p_game_id: gameId,
      p_allow_crossplay: crossplay,
    });

    if (rpcError) {
      console.error("Find Mates / find_mates_profiles:", rpcError);
      setRawResults([]);
      setError("Impossible de récupérer les profils pour le moment.");
      setErrorAction("search");
      setLoading(false);
      return;
    }

    const candidates = (data ?? []) as MateProfile[];
    setRawResults(candidates);
    await loadRelationships(candidates);
    setLoading(false);
  }

  async function sendFriendRequest(userId: string) {
    setBusyUserId(userId);
    setError("");
    setNotice("");
    setErrorAction(null);
    const { error: requestError } = await supabase.rpc("send_friend_request", {
      p_target_user_id: userId,
    });
    if (requestError) {
      console.error("Find Mates / send_friend_request:", requestError);
      setError(requestError.message.includes("already")
        ? "Une relation existe déjà avec ce joueur."
        : "Impossible d’envoyer la demande d’ami.");
    } else {
      setRelationships((current) => ({ ...current, [userId]: "sent" }));
      setNotice("Demande d’ami envoyée.");
    }
    setBusyUserId(null);
  }

  async function inviteToSquad(userId: string) {
    setBusyUserId(userId);
    setError("");
    setNotice("");
    setErrorAction(null);
    const gameId = selectedGame ? Number(selectedGame.game_id) : null;
    const { data, error: inviteError } = await supabase.rpc("invite_to_squad", {
      p_recipient_id: userId,
      p_game_id: gameId != null && Number.isFinite(gameId) ? gameId : null,
    });
    if (inviteError) {
      const message = inviteError.message;
      const needsSquad = message.includes("no_active_squad");
      setError(
        message.includes("only_owner_can_invite") ? "Seul le chef de la squad peut inviter." :
        message.includes("squad_full") ? "Ta squad est complète." :
        needsSquad ? "Crée d’abord une squad pour envoyer cette invitation." :
        "Impossible d’envoyer l’invitation de squad."
      );
      setErrorAction(needsSquad && onOpenSquads ? "squads" : null);
    } else {
      const result = data as { status?: string } | null;
      setNotice(result?.status === "already_pending"
        ? "Une invitation de squad est déjà en attente."
        : "Invitation de squad envoyée.");
    }
    setBusyUserId(null);
  }

  function resetFilters() {
    setMicOnly(false);
    setCrossplay(selectedGame?.crossplay_enabled ?? true);
    setSameRank(false);
    setSameRole(false);
    setSameRegion(false);
    setSameLanguage(false);
    setQuery("");
    setSortMode("compatibility");
  }

  if (!session) {
    return (
      <section className="mate-auth-wall">
        <div className="mate-auth-orbit"><img src="/gamemate-logo.png" alt="" /></div>
        <div>
          <span className="mate-kicker">DÉCOUVERTE GAMEMATE</span>
          <h1>Les bons mates, sans le hasard.</h1>
          <p>Connecte-toi pour rechercher de vrais joueurs selon ton jeu et tes préférences.</p>
          <button type="button" onClick={onLogin}>Se connecter</button>
        </div>
      </section>
    );
  }

  if (userGames.length === 0) {
    return (
      <section className="mate-setup-empty">
        <div className="mate-setup-visual"><span>＋</span></div>
        <span className="mate-kicker">PROFIL FACULTATIF</span>
        <h1>Ajoute ton premier jeu quand tu es prêt.</h1>
        <p>Ton inscription est terminée. Pour utiliser le matching, indique simplement un jeu et une plateforme depuis ton profil.</p>
        <div className="mate-setup-progress"><i style={{ width: `${profileCompletion}%` }} /></div>
        <small>Profil complété à {profileCompletion}%</small>
        {onOpenSettings && <button type="button" onClick={onOpenSettings}>Configurer mon profil</button>}
      </section>
    );
  }

  return (
    <div className="mate-page">
      <header className="mate-hero">
        <div className="mate-hero-copy">
          <span className="mate-kicker"><i /> MATCHING RÉEL</span>
          <h1>Trouve les joueurs qui <em>te correspondent.</em></h1>
          <p>Des filtres utiles, un score explicable et uniquement de vrais profils GameMate.</p>
        </div>

        <button className="mate-profile-score" type="button" onClick={onOpenSettings}>
          <span className="mate-score-ring" style={{ "--mate-progress": `${profileCompletion * 3.6}deg` } as CSSProperties}>
            <strong>{profileCompletion}%</strong>
          </span>
          <span><small>TON PROFIL</small><strong>{profileCompletion >= 80 ? "Prêt pour matcher" : "À compléter tranquillement"}</strong><em>Améliore la précision des résultats</em></span>
          <b>›</b>
        </button>
      </header>

      <section className="mate-game-bar">
        <div><span className="mate-step">01</span><span><small>JEU RECHERCHÉ</small><strong>{selectedGame?.gameName}</strong></span></div>
        <div className="mate-game-list">
          {userGames.map((game, index) => (
            <button type="button" key={`${game.game_id}-${game.platform_id ?? "none"}`}
              className={game.game_id === selectedGame?.game_id ? "active" : ""}
              onClick={() => selectGame(game)}>
              <span className={`mate-game-logo tone-${index % 4}`}>{game.gameName.slice(0, 2).toUpperCase()}</span>
              <span><strong>{game.gameName}</strong><small>{game.platformName ?? "Plateforme non renseignée"}</small></span>
              {game.is_primary && <i>Principal</i>}
            </button>
          ))}
        </div>
        {onOpenSettings && <button className="mate-add-game" type="button" onClick={onOpenSettings}>＋</button>}
      </section>

      <div className="mate-workspace">
        <aside className="mate-filters">
          <header><div><span className="mate-step">02</span><span><small>AFFINE TA RECHERCHE</small><strong>Critères</strong></span></div>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</header>

          <label className="mate-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pseudo, rang, rôle, région..." /></label>

          <div className="mate-filter-list">
            <FilterToggle icon="◉" title="Micro" description="Joueurs avec microphone" checked={micOnly} onChange={setMicOnly} />
            <FilterToggle icon="↔" title="Crossplay" description="Autres plateformes compatibles" checked={crossplay} onChange={setCrossplay} />
          </div>

          <button className="mate-advanced-toggle" type="button" onClick={() => setShowAdvanced((value) => !value)}><span>Filtres avancés</span><b>{showAdvanced ? "−" : "+"}</b></button>

          {showAdvanced && <div className="mate-filter-list advanced">
            <FilterToggle icon="◆" title="Même rang" description={selectedGame?.rank_text ?? "Rang non renseigné"} checked={sameRank} onChange={setSameRank} disabled={!selectedGame?.rank_text} />
            <FilterToggle icon="◇" title="Même rôle" description={selectedGame?.role_text ?? "Rôle non renseigné"} checked={sameRole} onChange={setSameRole} disabled={!selectedGame?.role_text} />
            <FilterToggle icon="⌖" title="Même région" description={profileRegion ?? "Région non renseignée"} checked={sameRegion} onChange={setSameRegion} disabled={!profileRegion} />
            <FilterToggle icon="文" title="Même langue" description={profileLanguage ?? "Langue non renseignée"} checked={sameLanguage} onChange={setSameLanguage} disabled={!profileLanguage} />
          </div>}

          <div className="mate-profile-data"><span><b>{gamingDna.length}</b> traits de jeu</span><span><b>{lookingFor.length}</b> intentions</span></div>

          <button className="mate-launch" type="button" disabled={loading} onClick={() => void searchMates()}><span>{loading ? "Recherche en cours..." : "Trouver mes mates"}</span><b>→</b></button>
          {activeFilterCount > 0 && <button className="mate-reset" type="button" onClick={resetFilters}>Réinitialiser les filtres</button>}
        </aside>

        <main className="mate-results">
          <header className="mate-results-head">
            <div><span className="mate-step">03</span><span><small>PROFILS COMPATIBLES</small><strong>{searched ? `${results.length} résultat${results.length > 1 ? "s" : ""}` : "Prêt à rechercher"}</strong></span></div>
            {searched && <label>Trier par<select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="compatibility">Compatibilité</option><option value="name">Nom</option></select></label>}
          </header>

          {error && <div className="mate-feedback error"><span>{error}</span>{errorAction === "search" && <button type="button" onClick={() => void searchMates()}>Réessayer</button>}{errorAction === "squads" && onOpenSquads && <button type="button" onClick={onOpenSquads}>Créer une squad</button>}</div>}
          {notice && <div className="mate-feedback success">✓ {notice}</div>}

          {!searched ? <DiscoveryState game={selectedGame} onSearch={() => void searchMates()} /> :
            loading ? <LoadingState /> :
            results.length === 0 ? <EmptyState onReset={resetFilters} /> :
            <div className="mate-grid">{results.map((mate) => {
              const compatibility = getCompatibility(mate, selectedGame, profileRegion, profileLanguage);
              return <MateCard key={mate.user_id} mate={mate} compatibility={compatibility}
                relationship={relationships[mate.user_id] ?? "none"} busy={busyUserId === mate.user_id}
                onOpenProfile={() => onOpenProfile(mate.user_id)}
                onAddFriend={() => void sendFriendRequest(mate.user_id)}
                onInvite={() => void inviteToSquad(mate.user_id)}
                onRespond={onOpenFriends}
                onMessage={onOpenMessages ? () => onOpenMessages(mate.user_id) : undefined} />;
            })}</div>}
        </main>
      </div>
    </div>
  );
}

function FilterToggle({ icon, title, description, checked, onChange, disabled = false }: {
  icon: string; title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  return <button type="button" className={`mate-filter ${checked ? "active" : ""}`} disabled={disabled} onClick={() => onChange(!checked)}><span>{icon}</span><span><strong>{title}</strong><small>{description}</small></span><i><b /></i></button>;
}

function DiscoveryState({ game, onSearch }: { game: UserGame | null; onSearch: () => void }) {
  return <section className="mate-state discovery"><div className="mate-radar"><img src="/gamemate-logo.png" alt="" /><i /><b /></div><span className="mate-kicker">PRÊT À SCANNER</span><h2>Qui joue à {game?.gameName ?? "ton jeu"} ?</h2><p>Lance la recherche pour afficher des comptes réels. Le score indique précisément les critères communs.</p><button type="button" onClick={onSearch}>Lancer la recherche</button></section>;
}

function LoadingState() {
  return <section className="mate-state"><span className="mate-loader" /><h2>Recherche des meilleurs profils...</h2><p>GameMate compare les critères disponibles sans inventer de joueurs.</p></section>;
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return <section className="mate-state"><span className="mate-empty-icon">⌁</span><h2>Aucun profil pour ces critères.</h2><p>Retire un ou deux filtres pour élargir la recherche.</p><button type="button" onClick={onReset}>Élargir la recherche</button></section>;
}

function MateCard({ mate, compatibility, relationship, busy, onOpenProfile, onAddFriend, onInvite, onRespond, onMessage }: {
  mate: MateProfile; compatibility: Compatibility; relationship: Relationship; busy: boolean;
  onOpenProfile: () => void; onAddFriend: () => void; onInvite: () => void; onRespond?: () => void; onMessage?: () => void;
}) {
  const name = mateName(mate);
  return <article className="mate-card">
    <div className="mate-card-glow" />
    <header>
      <div className="mate-avatar">{mate.avatar_url ? <img src={mate.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}<i /></div>
      <div className="mate-identity"><strong>{name}</strong><small>{mate.username ? `@${mate.username}` : "Profil GameMate"}</small><span>{[mate.region, mate.language].filter(Boolean).join(" · ") || "Informations à compléter"}</span></div>
      <div className="mate-compatibility" style={{ "--score": `${compatibility.score * 3.6}deg` } as CSSProperties}><strong>{compatibility.score}%</strong><small>compatible</small></div>
    </header>

    <p>{mate.bio || "Ce joueur n’a pas encore ajouté de présentation."}</p>

    <div className="mate-facts">
      <Fact label="Plateforme" value={mate.platform_name} />
      <Fact label="Rang" value={mate.rank_text} />
      <Fact label="Rôle" value={mate.role_text} />
      <Fact label="Mode" value={mate.mode_text} />
    </div>

    <div className="mate-reasons">{compatibility.reasons.slice(0, 4).map((reason) => <span key={reason}>✓ {reason}</span>)}</div>

    <footer>
      <button type="button" className="ghost" onClick={onOpenProfile}>Voir le profil</button>
      {relationship === "none" && <button type="button" className="primary" disabled={busy} onClick={onAddFriend}>{busy ? "Envoi..." : "＋ Ajouter"}</button>}
      {relationship === "sent" && <span className="mate-relation-status">Demande envoyée</span>}
      {relationship === "received" && (onRespond
        ? <button type="button" className="primary" onClick={onRespond}>Répondre</button>
        : <span className="mate-relation-status attention">Demande reçue</span>)}
      {relationship === "friends" && <>
        {onMessage && <button type="button" className="ghost" onClick={onMessage}>Message</button>}
        <button type="button" className="primary" disabled={busy} onClick={onInvite}>{busy ? "Envoi..." : "Inviter"}</button>
      </>}
    </footer>
  </article>;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return <span><small>{label}</small><strong>{value || "—"}</strong></span>;
}

function getCompatibility(mate: MateProfile, game: UserGame | null, region: string | null, language: string | null): Compatibility {
  let score = 35;
  const reasons = ["Même jeu"];
  if (game?.platformName && normalize(mate.platform_name) === normalize(game.platformName)) { score += 15; reasons.push("Même plateforme"); }
  if (game?.rank_text && normalize(mate.rank_text) === normalize(game.rank_text)) { score += 10; reasons.push("Même rang"); }
  if (game?.role_text && normalize(mate.role_text) === normalize(game.role_text)) { score += 10; reasons.push("Même rôle"); }
  if (game?.mode_text && normalize(mate.mode_text) === normalize(game.mode_text)) { score += 8; reasons.push("Même mode"); }
  if (game?.mic_enabled && mate.mic_enabled) { score += 7; reasons.push("Micro"); }
  if (game?.crossplay_enabled && mate.crossplay_enabled) { score += 5; reasons.push("Crossplay"); }
  if (region && normalize(mate.region) === normalize(region)) { score += 5; reasons.push("Même région"); }
  if (language && normalize(mate.language) === normalize(language)) { score += 5; reasons.push("Même langue"); }
  return { score: Math.min(100, score), reasons };
}

function mateName(mate: MateProfile) {
  return mate.display_name || mate.username || "Joueur GameMate";
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("fr") ?? "";
}
