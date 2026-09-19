import { useMemo, useState } from "react";
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

type GamingDnaTag = {
  id: string;
  name: string;
  category: string;
};

type LookingForOption = {
  id: string;
  label: string;
  slug: string;
};

type FindMatesProps = {
  session: Session | null;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  lookingFor: LookingForOption[];
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
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
  onLogin,
  onOpenProfile,
}: FindMatesProps) {
  const primaryGame = useMemo(
    () => userGames.find((game) => game.is_primary) ?? userGames[0] ?? null,
    [userGames]
  );

  const [selectedGameId, setSelectedGameId] = useState(
    primaryGame?.game_id ?? ""
  );
  const [micOnly, setMicOnly] = useState(false);
  const [crossplay, setCrossplay] = useState(
    primaryGame?.crossplay_enabled ?? true
  );
  const [sameRank, setSameRank] = useState(false);
  const [sameRole, setSameRole] = useState(false);
  const [regionOnly, setRegionOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MateProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const selectedGame =
    userGames.find((game) => game.game_id === selectedGameId) ??
    primaryGame ??
    null;

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

    const { data, error: rpcError } = await supabase.rpc(
      "find_mates_profiles",
      {
        p_game_id: gameId,
        p_allow_crossplay: crossplay,
      }
    );

    if (rpcError) {
      console.error("Find Mates / find_mates_profiles:", rpcError);
      setResults([]);
      setError("Impossible de récupérer les profils pour le moment.");
      setLoading(false);
      return;
    }

    let candidates = (data ?? []) as MateProfile[];

    if (micOnly) {
      candidates = candidates.filter((candidate) => candidate.mic_enabled);
    }

    if (!crossplay && selectedGame.platformName) {
      candidates = candidates.filter(
        (candidate) => candidate.platform_name === selectedGame.platformName
      );
    }

    if (sameRank && selectedGame.rank_text) {
      candidates = candidates.filter(
        (candidate) =>
          !candidate.rank_text || candidate.rank_text === selectedGame.rank_text
      );
    }

    if (sameRole && selectedGame.role_text) {
      candidates = candidates.filter(
        (candidate) =>
          !candidate.role_text || candidate.role_text === selectedGame.role_text
      );
    }

    if (regionOnly) {
      // Le RPC actuel ne donne pas la région du compte connecté.
      // On garde ce filtre visuel désactivé côté logique tant qu'une vraie comparaison backend n'est pas disponible.
    }

    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery) {
      candidates = candidates.filter((candidate) => {
        const haystack = [
          candidate.display_name,
          candidate.username,
          candidate.region,
          candidate.language,
          candidate.rank_text,
          candidate.role_text,
          candidate.mode_text,
          candidate.platform_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      });
    }

    setResults(candidates);
    setLoading(false);
  }

  function resetFilters() {
    setMicOnly(false);
    setCrossplay(primaryGame?.crossplay_enabled ?? true);
    setSameRank(false);
    setSameRole(false);
    setRegionOnly(false);
    setQuery("");
    setResults([]);
    setSearched(false);
    setError("");
  }

  if (!session) {
    return (
      <section className="fm2 fm2-locked">
        <div className="fm2-lock-orb fm2-lock-a" />
        <div className="fm2-lock-orb fm2-lock-b" />

        <div className="fm2-lock-content">
          <span className="fm2-kicker">TROUVER DES MATES</span>
          <h1>Découvre les joueurs qui te correspondent.</h1>
          <p>
            Connecte-toi pour accéder à la recherche détaillée GameMate et
            afficher de vrais profils Supabase.
          </p>
          <button type="button" className="fm2-primary" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="fm2">
      <div className="fm2-bg-grid" />
      <div className="fm2-orb fm2-orb-a" />
      <div className="fm2-orb fm2-orb-b" />

      <header className="fm2-header">
        <div>
          <span className="fm2-kicker">DÉCOUVERTE GAMEMATE</span>
          <h1>
            Trouver des <span>mates</span>
          </h1>
          <p>
            Recherche, filtre et explore les profils GameMate selon ton jeu et
            ta façon de jouer.
          </p>
        </div>

        <div className="fm2-profile-signals">
          <div>
            <small>GAMING DNA</small>
            <strong>{gamingDna.length}</strong>
          </div>
          <div>
            <small>INTENTIONS</small>
            <strong>{lookingFor.length}</strong>
          </div>
          <div>
            <small>JEUX</small>
            <strong>{userGames.length}</strong>
          </div>
        </div>
      </header>

      <div className="fm2-layout">
        <aside className="fm2-filters">
          <div className="fm2-filter-head">
            <div>
              <span className="fm2-kicker">FILTRES</span>
              <h2>Affiner la recherche</h2>
            </div>
            <button type="button" onClick={resetFilters}>
              Réinitialiser
            </button>
          </div>

          <label className="fm2-search-field">
            <span>⌕</span>
            <input
              type="text"
              placeholder="Pseudo, région, rôle..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="fm2-filter-section">
            <span className="fm2-filter-label">JEU</span>
            <div className="fm2-game-list">
              {userGames.map((game) => {
                const active = game.game_id === selectedGame?.game_id;

                return (
                  <button
                    type="button"
                    key={`${game.game_id}-${game.platform_id ?? "none"}`}
                    className={active ? "active" : ""}
                    onClick={() => {
                      setSelectedGameId(game.game_id);
                      setResults([]);
                      setSearched(false);
                    }}
                  >
                    <span className="fm2-game-mark">
                      {game.gameName.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{game.gameName}</strong>
                      <small>{game.platformName ?? "Plateforme inconnue"}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="fm2-filter-section">
            <span className="fm2-filter-label">PRÉFÉRENCES</span>

            <FilterToggle
              title="Micro uniquement"
              description="Afficher seulement les joueurs avec micro."
              checked={micOnly}
              onChange={setMicOnly}
            />

            <FilterToggle
              title="Crossplay"
              description="Autoriser les autres plateformes compatibles."
              checked={crossplay}
              onChange={setCrossplay}
            />

            <FilterToggle
              title="Rang proche"
              description="Privilégier ton rang actuel."
              checked={sameRank}
              onChange={setSameRank}
            />

            <FilterToggle
              title="Même rôle"
              description="Rechercher ton rôle préféré."
              checked={sameRole}
              onChange={setSameRole}
            />

            <FilterToggle
              title="Même région"
              description="Préparé pour une future comparaison backend."
              checked={regionOnly}
              onChange={setRegionOnly}
              disabled
            />
          </div>

          <button
            type="button"
            className="fm2-search-button"
            disabled={!selectedGame || loading}
            onClick={() => void searchMates()}
          >
            <span>◎</span>
            <span>
              <strong>{loading ? "Recherche..." : "Rechercher des mates"}</strong>
              <small>{selectedGame?.gameName ?? "Choisis un jeu"}</small>
            </span>
          </button>
        </aside>

        <main className="fm2-results">
          <div className="fm2-results-toolbar">
            <div>
              <span className="fm2-kicker">RÉSULTATS</span>
              <h2>
                {searched
                  ? `${results.length} profil${results.length > 1 ? "s" : ""}`
                  : "Prêt à découvrir"}
              </h2>
            </div>

            {selectedGame && (
              <div className="fm2-current-game">
                <span className="fm2-current-mark">
                  {selectedGame.gameName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <small>RECHERCHE ACTUELLE</small>
                  <strong>{selectedGame.gameName}</strong>
                </div>
              </div>
            )}
          </div>

          {error && <div className="fm2-error">{error}</div>}

          {!searched ? (
            <section className="fm2-start-state">
              <div className="fm2-radar">
                <span className="fm2-radar-ring a" />
                <span className="fm2-radar-ring b" />
                <span className="fm2-radar-ring c" />
                <img src="/gamemate-logo.png" alt="" />
              </div>

              <span className="fm2-kicker">À TOI DE JOUER</span>
              <h3>Choisis tes filtres et lance la recherche.</h3>
              <p>
                GameMate affichera ici uniquement les vrais profils retournés
                par Supabase.
              </p>
            </section>
          ) : loading ? (
            <section className="fm2-loading">
              <span className="fm2-loader" />
              <h3>Recherche des profils...</h3>
              <p>GameMate interroge les profils correspondant à ton jeu.</p>
            </section>
          ) : results.length === 0 ? (
            <section className="fm2-empty">
              <span>◎</span>
              <h3>Aucun mate trouvé avec ces filtres.</h3>
              <p>
                Essaie d’élargir le crossplay, de retirer certains filtres ou
                de choisir un autre jeu.
              </p>
            </section>
          ) : (
            <div className="fm2-card-grid">
              {results.map((mate) => (
                <MateCard
                  key={mate.user_id}
                  mate={mate}
                  onOpenProfile={() => onOpenProfile(mate.user_id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterToggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`fm2-toggle ${checked ? "active" : ""} ${
        disabled ? "disabled" : ""
      }`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="fm2-toggle-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="fm2-switch">
        <i />
      </span>
    </button>
  );
}

function MateCard({
  mate,
  onOpenProfile,
}: {
  mate: MateProfile;
  onOpenProfile: () => void;
}) {
  const name = mate.display_name || mate.username || "Joueur GameMate";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <article className="fm2-card">
      <div className="fm2-card-glow" />

      <div className="fm2-card-top">
        <div className="fm2-avatar">
          {mate.avatar_url ? (
            <img src={mate.avatar_url} alt={name} />
          ) : (
            initial
          )}
        </div>

        <div className="fm2-identity">
          <strong>{name}</strong>
          <span>
            {mate.username ? `@${mate.username}` : "Profil GameMate"}
          </span>
        </div>
      </div>

      <p className="fm2-bio">
        {mate.bio || "Aucune bio renseignée pour le moment."}
      </p>

      <div className="fm2-location">
        {mate.region && <span>{mate.region}</span>}
        {mate.language && <span>{mate.language}</span>}
      </div>

      <div className="fm2-game-data">
        {mate.platform_name && (
          <DataPill label="Plateforme" value={mate.platform_name} />
        )}
        {mate.rank_text && <DataPill label="Rang" value={mate.rank_text} />}
        {mate.role_text && <DataPill label="Rôle" value={mate.role_text} />}
        {mate.mode_text && <DataPill label="Mode" value={mate.mode_text} />}
      </div>

      <div className="fm2-features">
        {mate.mic_enabled && <span>◉ Micro</span>}
        {mate.crossplay_enabled && <span>↔ Crossplay</span>}
      </div>

      <div className="fm2-card-actions">
        <button type="button" className="fm2-view-profile" onClick={onOpenProfile}>
          Voir le profil
        </button>
      </div>
    </article>
  );
}

function DataPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="fm2-data-pill">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
