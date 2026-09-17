import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

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

type Props = {
  session: Session | null;
  userGames: UserGame[];
  lookingFor: LookingForOption[];
  onLogin: () => void;
};

export default function PlayNowPage({
  session,
  userGames,
  lookingFor,
  onLogin,
}: Props) {
  const primaryGame = useMemo(
    () =>
      userGames.find((game) => game.is_primary) ??
      userGames[0] ??
      null,
    [userGames]
  );

  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedIntentId, setSelectedIntentId] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [crossplayEnabled, setCrossplayEnabled] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!selectedGameId && primaryGame) {
      setSelectedGameId(primaryGame.game_id);
      setMicEnabled(primaryGame.mic_enabled);
      setCrossplayEnabled(primaryGame.crossplay_enabled);
    }
  }, [primaryGame, selectedGameId]);

  useEffect(() => {
    if (!selectedIntentId && lookingFor.length > 0) {
      setSelectedIntentId(lookingFor[0].id);
    }
  }, [lookingFor, selectedIntentId]);

  const selectedGame =
    userGames.find((game) => game.game_id === selectedGameId) ??
    primaryGame;

  function selectGame(game: UserGame) {
    if (searching) return;

    setSelectedGameId(game.game_id);
    setMicEnabled(game.mic_enabled);
    setCrossplayEnabled(game.crossplay_enabled);
  }

  function startSearch() {
    if (!selectedGame) return;

    /*
      Pour l'instant on active uniquement l'état visuel.

      Aucun faux joueur n'est généré ici.
      Le vrai moteur de matching Supabase sera branché ensuite.
    */
    setSearching(true);
  }

  function cancelSearch() {
    setSearching(false);
  }

  if (!session) {
    return (
      <div className="play-now-locked">
        <div className="play-now-locked-card">
          <span className="eyebrow">PLAY NOW</span>

          <h2>Connecte-toi pour jouer</h2>

          <p>
            GameMate utilisera ton profil, tes jeux et ton Gaming DNA
            pour chercher des joueurs compatibles.
          </p>

          <button
            type="button"
            className="primary"
            onClick={onLogin}
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (userGames.length === 0) {
    return (
      <div className="play-now-empty">
        <span className="eyebrow">PLAY NOW</span>

        <h2>Ajoute d’abord un jeu</h2>

        <p>
          Ton profil ne contient encore aucun jeu utilisable pour le
          matching.
        </p>
      </div>
    );
  }

  if (searching && selectedGame) {
    const selectedIntent = lookingFor.find(
      (option) => option.id === selectedIntentId
    );

    return (
      <div className="play-now-search">
        <div className="search-radar">
          <div className="search-radar-ring ring-one" />
          <div className="search-radar-ring ring-two" />
          <div className="search-radar-ring ring-three" />

          <div className="search-radar-core">
            <img
              src="/gamemate-logo.png"
              alt="GameMate"
            />
          </div>
        </div>

        <span className="play-search-status">
          RECHERCHE ACTIVE
        </span>

        <h2>On cherche tes prochains mates.</h2>

        <p>
          GameMate prépare une recherche pour{" "}
          <strong>{selectedGame.gameName}</strong>.
        </p>

        <div className="search-summary">
          <SearchSummaryItem
            label="Jeu"
            value={selectedGame.gameName}
          />

          <SearchSummaryItem
            label="Plateforme"
            value={selectedGame.platformName ?? "Non renseignée"}
          />

          <SearchSummaryItem
            label="Recherche"
            value={selectedIntent?.label ?? "Mates"}
          />

          <SearchSummaryItem
            label="Micro"
            value={micEnabled ? "Activé" : "Désactivé"}
          />

          <SearchSummaryItem
            label="Crossplay"
            value={crossplayEnabled ? "Activé" : "Désactivé"}
          />
        </div>

        <div className="play-search-info">
          <span className="play-search-info-dot" />

          <span>
            Le vrai moteur de matching sera connecté à cette recherche.
            Aucun faux profil n’est affiché.
          </span>
        </div>

        <button
          type="button"
          className="play-cancel-button"
          onClick={cancelSearch}
        >
          Annuler la recherche
        </button>
      </div>
    );
  }

  return (
    <div className="play-now-page">
      <section className="play-now-hero">
        <div className="play-now-hero-glow" />

        <div>
          <span className="eyebrow">PLAY NOW</span>

          <h2>Trouve une partie. Trouve tes mates.</h2>

          <p>
            Choisis ton jeu et tes préférences. GameMate utilisera
            ensuite ton profil pour trouver des joueurs compatibles.
          </p>
        </div>

        <div className="play-now-hero-badge">
          <span />
          Prêt à jouer
        </div>
      </section>

      <section className="play-now-section">
        <div className="play-section-title">
          <div>
            <span className="eyebrow">ÉTAPE 01</span>
            <h3>Choisis ton jeu</h3>
          </div>

          <span className="play-section-hint">
            {userGames.length} disponible
            {userGames.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="play-games-grid">
          {userGames.map((game) => {
            const selected = game.game_id === selectedGame?.game_id;

            return (
              <button
                type="button"
                key={`${game.game_id}-${game.platform_id ?? "none"}`}
                className={`play-game-card ${
                  selected ? "selected" : ""
                }`}
                onClick={() => selectGame(game)}
              >
                <div className="play-game-card-head">
                  <div className="play-game-icon">
                    {game.gameName.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="play-game-name">
                    <strong>{game.gameName}</strong>

                    <span>
                      {game.platformName ?? "Plateforme non renseignée"}
                    </span>
                  </div>

                  {game.is_primary && (
                    <span className="play-primary-game">
                      Principal
                    </span>
                  )}

                  <span className="play-select-indicator">
                    {selected ? "✓" : ""}
                  </span>
                </div>

                <div className="play-game-metadata">
                  {game.rank_text && (
                    <span>
                      Rang
                      <strong>{game.rank_text}</strong>
                    </span>
                  )}

                  {game.role_text && (
                    <span>
                      Rôle
                      <strong>{game.role_text}</strong>
                    </span>
                  )}

                  {game.mode_text && (
                    <span>
                      Mode
                      <strong>{game.mode_text}</strong>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="play-now-columns">
        <section className="play-now-section">
          <div className="play-section-title">
            <div>
              <span className="eyebrow">ÉTAPE 02</span>
              <h3>Qu’est-ce que tu cherches ?</h3>
            </div>
          </div>

          {lookingFor.length > 0 ? (
            <div className="play-intent-grid">
              {lookingFor.map((option) => {
                const selected =
                  option.id === selectedIntentId;

                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`play-intent ${
                      selected ? "selected" : ""
                    }`}
                    onClick={() =>
                      setSelectedIntentId(option.id)
                    }
                  >
                    <span className="play-intent-radio">
                      {selected && <i />}
                    </span>

                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="play-section-empty">
              Aucune préférence “Je recherche” configurée. Tu peux
              quand même lancer une recherche standard.
            </p>
          )}
        </section>

        <section className="play-now-section">
          <div className="play-section-title">
            <div>
              <span className="eyebrow">ÉTAPE 03</span>
              <h3>Préférences de session</h3>
            </div>
          </div>

          <div className="play-preferences">
            <PreferenceToggle
              icon="◉"
              title="Micro"
              description="Je veux pouvoir utiliser le vocal."
              enabled={micEnabled}
              onChange={() =>
                setMicEnabled((current) => !current)
              }
            />

            <PreferenceToggle
              icon="↔"
              title="Crossplay"
              description="Autoriser les joueurs d’autres plateformes."
              enabled={crossplayEnabled}
              onChange={() =>
                setCrossplayEnabled((current) => !current)
              }
            />
          </div>
        </section>
      </div>

      {selectedGame && (
        <section className="play-launch-panel">
          <div className="play-launch-glow" />

          <div className="play-launch-game">
            <div className="play-launch-icon">
              {selectedGame.gameName
                .slice(0, 2)
                .toUpperCase()}
            </div>

            <div>
              <span>TA RECHERCHE</span>
              <strong>{selectedGame.gameName}</strong>

              <p>
                {selectedGame.platformName ??
                  "Plateforme non renseignée"}
                {selectedGame.rank_text
                  ? ` • ${selectedGame.rank_text}`
                  : ""}
                {selectedGame.mode_text
                  ? ` • ${selectedGame.mode_text}`
                  : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="play-launch-button"
            onClick={startSearch}
          >
            <span>▶</span>

            <div>
              <strong>Lancer la recherche</strong>
              <small>Trouver des mates maintenant</small>
            </div>

            <span className="play-launch-arrow">→</span>
          </button>
        </section>
      )}
    </div>
  );
}

function PreferenceToggle({
  icon,
  title,
  description,
  enabled,
  onChange,
}: {
  icon: string;
  title: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={`play-preference ${
        enabled ? "enabled" : ""
      }`}
      onClick={onChange}
    >
      <span className="play-preference-icon">
        {icon}
      </span>

      <span className="play-preference-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>

      <span className="play-switch">
        <i />
      </span>
    </button>
  );
}

function SearchSummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="search-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}