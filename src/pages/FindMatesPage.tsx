import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenSettings?: () => void;
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

export default function FindMatesPage({
  session,
  userGames,
  gamingDna,
  lookingFor,
  profileCompletion = 0,
  onLogin,
  onOpenProfile,
  onOpenSettings,
}: FindMatesProps) {
  const primaryGame = useMemo(
    () => userGames.find((game) => game.is_primary) ?? userGames[0] ?? null,
    [userGames]
  );

  const [selectedGameId, setSelectedGameId] = useState(primaryGame?.game_id ?? "");
  const [micOnly, setMicOnly] = useState(false);
  const [crossplay, setCrossplay] = useState(primaryGame?.crossplay_enabled ?? true);
  const [sameRank, setSameRank] = useState(false);
  const [sameRole, setSameRole] = useState(false);
  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [results, setResults] = useState<MateProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const selectedGame =
    userGames.find((game) => game.game_id === selectedGameId) ?? primaryGame ?? null;

  const activeFilterCount = [micOnly, !crossplay, sameRank, sameRole, Boolean(query.trim())]
    .filter(Boolean).length;

  function selectGame(game: UserGame) {
    setSelectedGameId(game.game_id);
    setCrossplay(game.crossplay_enabled);
    setResults([]);
    setSearched(false);
    setError("");
  }

  async function searchMates() {
    if (!session) {
      onLogin();
      return;
    }
    if (!selectedGame) {
      setError("Ajoute au moins un jeu à ton profil avant de rechercher des mates.");
      return;
    }

    const gameId = Number(selectedGame.game_id);
    if (!Number.isFinite(gameId)) {
      setError("Le jeu sélectionné possède un identifiant invalide.");
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);

    const { data, error: rpcError } = await supabase.rpc("find_mates_profiles", {
      p_game_id: gameId,
      p_allow_crossplay: crossplay,
    });

    if (rpcError) {
      console.error("Find Mates / find_mates_profiles:", rpcError);
      setResults([]);
      setError("Impossible de récupérer les profils pour le moment.");
      setLoading(false);
      return;
    }

    let candidates = (data ?? []) as MateProfile[];
    if (micOnly) candidates = candidates.filter((candidate) => candidate.mic_enabled);
    if (!crossplay && selectedGame.platformName) {
      candidates = candidates.filter(
        (candidate) => candidate.platform_name === selectedGame.platformName
      );
    }
    if (sameRank && selectedGame.rank_text) {
      candidates = candidates.filter(
        (candidate) => !candidate.rank_text || candidate.rank_text === selectedGame.rank_text
      );
    }
    if (sameRole && selectedGame.role_text) {
      candidates = candidates.filter(
        (candidate) => !candidate.role_text || candidate.role_text === selectedGame.role_text
      );
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      candidates = candidates.filter((candidate) =>
        [candidate.display_name, candidate.username, candidate.region, candidate.language,
          candidate.rank_text, candidate.role_text, candidate.mode_text, candidate.platform_name]
          .filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery)
      );
    }

    setResults(candidates);
    setLoading(false);
  }

  function resetFilters() {
    setMicOnly(false);
    setCrossplay(selectedGame?.crossplay_enabled ?? true);
    setSameRank(false);
    setSameRole(false);
    setQuery("");
    setResults([]);
    setSearched(false);
    setError("");
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
    <div className="fmx">
      <header className="fmx-hero">
        <div className="fmx-hero-copy">
          <span className="fmx-eyebrow">FIND MATES</span>
          <h1>Trouve des joueurs qui <em>jouent comme toi.</em></h1>
          <p>Choisis un jeu, garde les critères importants et découvre des profils réels.</p>
        </div>

        <button className="fmx-profile-health" type="button" onClick={onOpenSettings}>
          <span className="fmx-health-ring" style={{ "--progress": `${profileCompletion * 3.6}deg` } as CSSProperties}>
            <strong>{profileCompletion}%</strong>
          </span>
          <span>
            <small>QUALITÉ DU PROFIL</small>
            <strong>{profileCompletion >= 80 ? "Prêt pour le matching" : "À compléter"}</strong>
            <em>Un profil précis améliore les résultats.</em>
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
            <button type="button" key={`${game.game_id}-${game.platform_id ?? "none"}`}
              className={game.game_id === selectedGame?.game_id ? "active" : ""}
              onClick={() => selectGame(game)}>
              <span className={`fmx-game-art tone-${index % 4}`}>{game.gameName.slice(0, 2).toUpperCase()}</span>
              <span><strong>{game.gameName}</strong><small>{game.platformName ?? "Plateforme inconnue"}</small></span>
              {game.is_primary && <i>Principal</i>}
            </button>
          ))}
        </div>
      </section>

      <div className="fmx-workspace">
        <aside className="fmx-filter-panel">
          <div className="fmx-panel-head">
            <div><span className="fmx-eyebrow">02 · TES CRITÈRES</span><h2>Filtres</h2></div>
            {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </div>

          <label className="fmx-query"><span>⌕</span><input value={query}
            onChange={(event) => setQuery(event.target.value)} placeholder="Pseudo, région, rôle..." /></label>

          <div className="fmx-quick-filters">
            <FilterToggle icon="◉" title="Micro obligatoire" description="Uniquement les joueurs avec micro."
              checked={micOnly} onChange={setMicOnly} />
            <FilterToggle icon="↔" title="Crossplay autorisé" description="Inclure les plateformes compatibles."
              checked={crossplay} onChange={setCrossplay} />
          </div>

          <button className="fmx-advanced-trigger" type="button" onClick={() => setShowAdvanced((value) => !value)}>
            <span>Critères avancés</span><b>{showAdvanced ? "−" : "+"}</b>
          </button>

          {showAdvanced && (
            <div className="fmx-advanced">
              <FilterToggle icon="◆" title="Rang proche"
                description={selectedGame?.rank_text ? `Autour de ${selectedGame.rank_text}.` : "Renseigne ton rang dans le profil."}
                checked={sameRank} onChange={setSameRank} disabled={!selectedGame?.rank_text} />
              <FilterToggle icon="◇" title="Même rôle"
                description={selectedGame?.role_text ? `Rôle : ${selectedGame.role_text}.` : "Renseigne ton rôle dans le profil."}
                checked={sameRole} onChange={setSameRole} disabled={!selectedGame?.role_text} />
            </div>
          )}

          <div className="fmx-profile-signals">
            <span><b>{gamingDna.length}</b> traits Gaming DNA</span>
            <span><b>{lookingFor.length}</b> intentions</span>
          </div>

          <button className="fmx-search-button" type="button" disabled={!selectedGame || loading} onClick={() => void searchMates()}>
            <span>{loading ? "Recherche..." : "Découvrir mes mates"}</span><b>→</b>
          </button>
          {activeFilterCount > 0 && <button className="fmx-reset" type="button" onClick={resetFilters}>Réinitialiser les filtres</button>}
        </aside>

        <main className="fmx-results">
          <div className="fmx-results-head">
            <div><span className="fmx-eyebrow">03 · DÉCOUVRE</span>
              <h2>{searched ? `${results.length} profil${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""}` : "Prêt à lancer la recherche"}</h2></div>
            {selectedGame && <span className="fmx-search-context"><i>{selectedGame.gameName.slice(0, 2).toUpperCase()}</i>
              <span><small>RECHERCHE ACTUELLE</small><strong>{selectedGame.gameName}</strong></span></span>}
          </div>

          {error && <div className="fmx-error">{error}</div>}

          {!searched ? (
            <DiscoveryState game={selectedGame} onSearch={() => void searchMates()} />
          ) : loading ? (
            <div className="fmx-state"><span className="fmx-loader" /><h3>On cherche les bons profils...</h3><p>GameMate analyse les joueurs compatibles avec cette configuration.</p></div>
          ) : results.length === 0 ? (
            <div className="fmx-state"><span className="fmx-state-icon">⌁</span><h3>Aucun mate avec ces critères.</h3><p>Élargis les filtres ou active le crossplay pour voir davantage de profils.</p><button type="button" onClick={resetFilters}>Élargir la recherche</button></div>
          ) : (
            <div className="fmx-card-grid">
              {results.map((mate) => <MateCard key={mate.user_id} mate={mate} game={selectedGame} onOpenProfile={() => onOpenProfile(mate.user_id)} />)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterToggle({ icon, title, description, checked, onChange, disabled = false }: {
  icon: string; title: string; description: string; checked: boolean;
  onChange: (value: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" className={`fmx-toggle ${checked ? "active" : ""}`} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="fmx-toggle-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><i><b /></i>
    </button>
  );
}

function DiscoveryState({ game, onSearch }: { game: UserGame | null; onSearch: () => void }) {
  return (
    <div className="fmx-discovery-state">
      <div className="fmx-radar"><span /><i /><b /><img src="/gamemate-logo.png" alt="" /></div>
      <span className="fmx-eyebrow">MATCHING PRÊT</span>
      <h3>{game ? `Qui joue à ${game.gameName} ?` : "Configure ton premier jeu"}</h3>
      <p>Les résultats seront de vrais comptes GameMate. Aucun profil fictif ne sera ajouté.</p>
      {game && <button type="button" onClick={onSearch}>Lancer la découverte</button>}
    </div>
  );
}

function MateCard({ mate, game, onOpenProfile }: { mate: MateProfile; game: UserGame | null; onOpenProfile: () => void }) {
  const name = mate.display_name || mate.username || "Joueur GameMate";
  const reasons = [
    game?.platformName && mate.platform_name === game.platformName ? "Même plateforme" : null,
    game?.rank_text && mate.rank_text === game.rank_text ? "Même rang" : null,
    game?.role_text && mate.role_text === game.role_text ? "Même rôle" : null,
    mate.mic_enabled ? "Micro" : null,
  ].filter(Boolean) as string[];

  return (
    <article className="fmx-card">
      <div className="fmx-card-accent" />
      <div className="fmx-card-top">
        <div className="fmx-avatar">{mate.avatar_url ? <img src={mate.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}</div>
        <div className="fmx-identity"><strong>{name}</strong><span>{mate.username ? `@${mate.username}` : "Profil GameMate"}</span></div>
        <span className="fmx-platform">{mate.platform_name ?? "Plateforme ?"}</span>
      </div>
      <p className="fmx-bio">{mate.bio || "Ce joueur n'a pas encore ajouté de présentation."}</p>
      <div className="fmx-card-meta">
        {mate.rank_text && <Meta label="Rang" value={mate.rank_text} />}
        {mate.role_text && <Meta label="Rôle" value={mate.role_text} />}
        {mate.mode_text && <Meta label="Mode" value={mate.mode_text} />}
      </div>
      <div className="fmx-reasons">
        {reasons.length > 0 ? reasons.map((reason) => <span key={reason}>✓ {reason}</span>) : <span>Profil compatible avec le jeu</span>}
      </div>
      <div className="fmx-card-bottom"><span>{[mate.region, mate.language].filter(Boolean).join(" · ") || "Localisation non renseignée"}</span>
        <button type="button" onClick={onOpenProfile}>Voir le profil <b>→</b></button></div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}
