import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./PlayNowPage.css";

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

type LookingForOption = {
  id: string;
  label: string;
  slug: string;
};

type PlayNowProps = {
  session: Session | null;
  userGames: UserGame[];
  lookingFor: LookingForOption[];
  onLogin: () => void;
};

type SearchMode = "fast" | "balanced" | "precise";
type SearchStatus = "idle" | "searching" | "results" | "error";

type MateResult = {
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

export default function PlayNowPage({
  session,
  userGames,
  lookingFor,
  onLogin,
}: PlayNowProps) {
  const primaryGame = useMemo(
    () => userGames.find((game) => game.is_primary) ?? userGames[0] ?? null,
    [userGames]
  );

  const [selectedGameId, setSelectedGameId] = useState(primaryGame?.game_id ?? "");
  const selectedGame =
    userGames.find((game) => game.game_id === selectedGameId) ??
    primaryGame ??
    null;

  const defaultIntent =
    lookingFor.find((option) => option.slug === "play-now") ??
    lookingFor[0] ??
    null;

  const [intentId, setIntentId] = useState(defaultIntent?.id ?? "");
  const [micRequired, setMicRequired] = useState(selectedGame?.mic_enabled ?? true);
  const [crossplay, setCrossplay] = useState(selectedGame?.crossplay_enabled ?? true);
  const [partySize, setPartySize] = useState(2);
  const [searchMode, setSearchMode] = useState<SearchMode>("balanced");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<MateResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedGameId && primaryGame?.game_id) {
      setSelectedGameId(primaryGame.game_id);
    }
  }, [primaryGame?.game_id, selectedGameId]);

  function changeGame(gameId: string) {
    setSelectedGameId(gameId);

    const game = userGames.find((item) => item.game_id === gameId);
    if (game) {
      setMicRequired(game.mic_enabled);
      setCrossplay(game.crossplay_enabled);
    }

    setStatus("idle");
    setResults([]);
    setError("");
  }

  async function startSearch() {
    if (!session) {
      onLogin();
      return;
    }

    if (!selectedGame) {
      setError("Ajoute au moins un jeu à ton profil avant de lancer une recherche.");
      setStatus("error");
      return;
    }

    setError("");
    setResults([]);
    setStatus("searching");

    const gameId = Number(selectedGame.game_id);

    if (!Number.isFinite(gameId)) {
      setError("Le jeu sélectionné possède un identifiant invalide.");
      setStatus("error");
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("find_mates_profiles", {
      p_game_id: gameId,
      p_allow_crossplay: crossplay,
    });

    if (rpcError) {
      console.error("Play Now / find_mates_profiles:", rpcError);
      setError("Impossible de lancer la recherche pour le moment.");
      setStatus("error");
      return;
    }

    let candidates = (data ?? []) as MateResult[];

    if (micRequired) {
      candidates = candidates.filter((candidate) => candidate.mic_enabled);
    }

    if (!crossplay && selectedGame.platformName) {
      candidates = candidates.filter(
        (candidate) => candidate.platform_name === selectedGame.platformName
      );
    }

    if (searchMode === "precise") {
      candidates = candidates.filter((candidate) => {
        const sameRank =
          !selectedGame.rank_text ||
          !candidate.rank_text ||
          candidate.rank_text === selectedGame.rank_text;

        const sameRole =
          !selectedGame.role_text ||
          !candidate.role_text ||
          candidate.role_text === selectedGame.role_text;

        return sameRank && sameRole;
      });
    }

    if (searchMode === "balanced") {
      candidates = [...candidates].sort((a, b) => {
        const score = (candidate: MateResult) => {
          let value = 0;

          if (
            selectedGame.rank_text &&
            candidate.rank_text === selectedGame.rank_text
          ) {
            value += 2;
          }

          if (
            selectedGame.role_text &&
            candidate.role_text === selectedGame.role_text
          ) {
            value += 2;
          }

          if (
            selectedGame.mode_text &&
            candidate.mode_text === selectedGame.mode_text
          ) {
            value += 1;
          }

          if (candidate.mic_enabled === micRequired) {
            value += 1;
          }

          return value;
        };

        return score(b) - score(a);
      });
    }

    setResults(candidates.slice(0, Math.max(1, partySize - 1) * 6));
    setStatus("results");
  }

  function resetSearch() {
    setStatus("idle");
    setResults([]);
    setError("");
  }

  if (!session) {
    return (
      <section className="play-clean locked">
        <div>
          <span className="play-kicker">JOUER</span>
          <h1>Trouve tes prochains mates.</h1>
          <p>Connecte-toi pour lancer une recherche avec tes jeux et tes préférences.</p>
          <button type="button" className="play-primary" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="play-clean">
      <header className="play-head">
        <span className="play-kicker">PLAY NOW</span>
        <h1>Jouer</h1>
        <p>Choisis ton jeu et lance une recherche. Le reste reste simple.</p>
      </header>

      {status === "searching" ? (
        <SearchingView game={selectedGame} onCancel={resetSearch} />
      ) : status === "results" ? (
        <ResultsView
          game={selectedGame}
          results={results}
          onRetry={() => void startSearch()}
          onEdit={resetSearch}
        />
      ) : (
        <>
          <section className="play-hero">
            <div className="play-selected-game">
              <span className="play-game-art">
                {selectedGame?.gameName.slice(0, 2).toUpperCase() ?? "GM"}
              </span>

              <div>
                <span className="play-kicker">JEU SÉLECTIONNÉ</span>
                <h2>{selectedGame?.gameName ?? "Aucun jeu configuré"}</h2>
                <p>{selectedGame?.platformName ?? "Ajoute un jeu à ton profil."}</p>
              </div>
            </div>

            {userGames.length > 1 && (
              <div className="play-game-picker">
                {userGames.map((game) => (
                  <button
                    key={`${game.game_id}-${game.platform_id ?? "none"}`}
                    type="button"
                    className={game.game_id === selectedGame?.game_id ? "active" : ""}
                    onClick={() => changeGame(game.game_id)}
                  >
                    <span>{game.gameName.slice(0, 2).toUpperCase()}</span>
                    <strong>{game.gameName}</strong>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="play-options">
            <div className="play-section-head">
              <div>
                <span className="play-kicker">SESSION</span>
                <h2>Ce que tu veux jouer</h2>
              </div>
            </div>

            {lookingFor.length > 0 && (
              <div className="play-intents">
                {lookingFor.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={intentId === option.id ? "active" : ""}
                    onClick={() => setIntentId(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            <div className="play-settings-grid">
              <SettingBlock title="Taille du groupe">
                <div className="play-choice-row">
                  {[2, 3, 4, 5].map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={partySize === size ? "active" : ""}
                      onClick={() => setPartySize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </SettingBlock>

              <SettingBlock title="Type de recherche">
                <div className="play-choice-row modes">
                  <button
                    type="button"
                    className={searchMode === "fast" ? "active" : ""}
                    onClick={() => setSearchMode("fast")}
                  >
                    Rapide
                  </button>
                  <button
                    type="button"
                    className={searchMode === "balanced" ? "active" : ""}
                    onClick={() => setSearchMode("balanced")}
                  >
                    Équilibré
                  </button>
                  <button
                    type="button"
                    className={searchMode === "precise" ? "active" : ""}
                    onClick={() => setSearchMode("precise")}
                  >
                    Précis
                  </button>
                </div>
              </SettingBlock>

              <SettingBlock title="Options">
                <div className="play-toggles">
                  <Toggle
                    label="Micro"
                    checked={micRequired}
                    onChange={setMicRequired}
                  />
                  <Toggle
                    label="Crossplay"
                    checked={crossplay}
                    onChange={setCrossplay}
                  />
                </div>
              </SettingBlock>
            </div>
          </section>

          {status === "error" && error && (
            <div className="play-error">{error}</div>
          )}

          <section className="play-launch">
            <div>
              <span className="play-kicker">PRÊT</span>
              <strong>
                {selectedGame
                  ? `${selectedGame.gameName} · ${partySize} joueurs · ${searchModeLabel(searchMode)}`
                  : "Sélectionne un jeu"}
              </strong>
            </div>

            <button
              type="button"
              disabled={!selectedGame}
              onClick={() => void startSearch()}
            >
              <span>▶</span>
              Lancer la recherche
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function SettingBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="play-setting-block">
      <span>{title}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`play-toggle ${checked ? "active" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <i><b /></i>
    </button>
  );
}

function SearchingView({
  game,
  onCancel,
}: {
  game: UserGame | null;
  onCancel: () => void;
}) {
  return (
    <section className="play-searching">
      <div className="play-search-ring">
        <span />
        <img src="/gamemate-logo.png" alt="" />
      </div>

      <span className="play-kicker">RECHERCHE EN COURS</span>
      <h2>{game?.gameName ?? "GameMate"}</h2>
      <p>Recherche de joueurs compatibles dans les profils GameMate.</p>

      <button type="button" onClick={onCancel}>
        Annuler
      </button>
    </section>
  );
}

function ResultsView({
  game,
  results,
  onRetry,
  onEdit,
}: {
  game: UserGame | null;
  results: MateResult[];
  onRetry: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="play-results">
      <header>
        <div>
          <span className="play-kicker">RÉSULTATS</span>
          <h2>
            {results.length > 0
              ? `${results.length} joueur${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""}`
              : "Aucun joueur trouvé"}
          </h2>
          <p>{game?.gameName ?? "Recherche GameMate"}</p>
        </div>

        <div>
          <button type="button" onClick={onEdit}>Modifier</button>
          <button type="button" className="primary" onClick={onRetry}>Relancer</button>
        </div>
      </header>

      {results.length === 0 ? (
        <div className="play-empty">
          <strong>Aucun résultat pour cette configuration.</strong>
          <p>Essaie une recherche plus rapide ou autorise davantage d’options.</p>
        </div>
      ) : (
        <div className="play-result-list">
          {results.map((mate) => {
            const name = mate.display_name || mate.username || "Joueur GameMate";

            return (
              <article key={mate.user_id}>
                <span className="play-avatar">
                  {mate.avatar_url ? (
                    <img src={mate.avatar_url} alt={name} />
                  ) : (
                    name.slice(0, 1).toUpperCase()
                  )}
                </span>

                <div className="play-result-copy">
                  <strong>{name}</strong>
                  <small>
                    {[mate.platform_name, mate.rank_text, mate.role_text]
                      .filter(Boolean)
                      .join(" · ") || "Profil GameMate"}
                  </small>
                  {mate.bio && <p>{mate.bio}</p>}
                </div>

                <div className="play-result-tags">
                  {mate.mic_enabled && <span>Micro</span>}
                  {mate.crossplay_enabled && <span>Crossplay</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function searchModeLabel(mode: SearchMode) {
  if (mode === "fast") return "Rapide";
  if (mode === "precise") return "Précis";
  return "Équilibré";
}
