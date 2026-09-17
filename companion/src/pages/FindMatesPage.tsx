import { useEffect, useMemo, useState } from "react";
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
  platform_name: string | null;

  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;

  mic_enabled: boolean;
  crossplay_enabled: boolean;
  is_primary: boolean;
};

type Props = {
  session: Session | null;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  lookingFor: LookingForOption[];
  onLogin: () => void;

  onOpenProfile: (userId: string) => void;
};

function FindMatesPage({
  session,
  userGames,
  gamingDna,
  lookingFor,
  onLogin,
  onOpenProfile,
}: Props) {
  const primaryGame = useMemo(() => {
    return (
      userGames.find((game) => game.is_primary) ??
      userGames[0] ??
      null
    );
  }, [userGames]);

  const [selectedGameId, setSelectedGameId] =
    useState<string>("");

  const [micOnly, setMicOnly] =
    useState(false);

  const [crossplayOnly, setCrossplayOnly] =
    useState(false);

  const [mates, setMates] =
    useState<MateProfile[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (
      !selectedGameId &&
      primaryGame?.game_id
    ) {
      setSelectedGameId(
        String(primaryGame.game_id)
      );
    }
  }, [
    primaryGame,
    selectedGameId,
  ]);

  const selectedGame = useMemo(() => {
    return userGames.find(
      (game) =>
        String(game.game_id) ===
        String(selectedGameId)
    );
  }, [
    userGames,
    selectedGameId,
  ]);

  useEffect(() => {
    if (!session?.user?.id) {
      setMates([]);
      return;
    }

    if (!selectedGameId) {
      setMates([]);
      return;
    }

    let cancelled = false;

    async function loadMates() {
      setLoading(true);
      setError(null);

      const numericGameId =
        Number(selectedGameId);

      const numericPlatformId =
        selectedGame?.platform_id
          ? Number(
              selectedGame.platform_id
            )
          : null;

      if (
        !Number.isFinite(
          numericGameId
        )
      ) {
        setError(
          "Identifiant de jeu invalide."
        );

        setLoading(false);
        return;
      }

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "find_mates_profiles",
        {
          p_game_id:
            numericGameId,

          p_platform_id:
            numericPlatformId,

          p_allow_crossplay:
            crossplayOnly,
        }
      );

      if (cancelled) {
        return;
      }

      if (rpcError) {
        console.error(
          "find_mates_profiles error:",
          rpcError
        );

        setError(
          "Impossible de récupérer les joueurs pour le moment."
        );

        setMates([]);
        setLoading(false);

        return;
      }

      setMates(
        (data ?? []) as MateProfile[]
      );

      setLoading(false);
    }

    void loadMates();

    return () => {
      cancelled = true;
    };
  }, [
    session?.user?.id,
    selectedGameId,
    selectedGame?.platform_id,
    crossplayOnly,
  ]);

  const filteredMates =
    useMemo(() => {
      return mates.filter(
        (mate) => {
          if (
            micOnly &&
            !mate.mic_enabled
          ) {
            return false;
          }

          return true;
        }
      );
    }, [
      mates,
      micOnly,
    ]);

  if (!session) {
    return (
      <div className="find-mates-page">
        <div className="find-mates-locked">
          <div className="find-mates-locked-icon">
            GM
          </div>

          <h2>
            Connecte-toi pour trouver tes mates
          </h2>

          <p>
            GameMate utilise tes jeux et
            tes préférences pour te
            proposer des joueurs
            compatibles.
          </p>

          <button
            type="button"
            className="find-mates-primary-button"
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
      <div className="find-mates-page">
        <div className="find-mates-empty-main">
          <span className="find-mates-eyebrow">
            Trouver des mates
          </span>

          <h2>
            Ajoute d'abord un jeu à ton profil
          </h2>

          <p>
            GameMate a besoin d'au moins
            un jeu configuré pour
            rechercher des joueurs
            compatibles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="find-mates-page">
      <section className="find-mates-hero">
        <div className="find-mates-hero-glow" />

        <div className="find-mates-hero-content">
          <div>
            <span className="find-mates-eyebrow">
              MATCHMAKING GAMEMATE
            </span>

            <h1>
              Trouve tes prochains mates.
            </h1>

            <p>
              Recherche de vrais joueurs
              GameMate selon ton jeu, ta
              plateforme et tes
              préférences.
            </p>
          </div>

          <div className="find-mates-result-counter">
            <strong>
              {filteredMates.length}
            </strong>

            <span>
              {filteredMates.length > 1
                ? "profils trouvés"
                : "profil trouvé"}
            </span>
          </div>
        </div>
      </section>

      <div className="find-mates-layout">
        <aside className="find-mates-sidebar">
          <section className="find-mates-filter-card">
            <div className="find-mates-filter-heading">
              <span>Jeu</span>

              <small>
                obligatoire
              </small>
            </div>

            <div className="find-mates-games-list">
              {userGames.map(
                (game) => {
                  const active =
                    String(
                      game.game_id
                    ) ===
                    String(
                      selectedGameId
                    );

                  return (
                    <button
                      type="button"
                      key={String(
                        game.game_id
                      )}
                      className={`find-mates-game-option ${
                        active
                          ? "active"
                          : ""
                      }`}
                      onClick={() =>
                        setSelectedGameId(
                          String(
                            game.game_id
                          )
                        )
                      }
                    >
                      <div className="find-mates-game-icon">
                        {game.gameName
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>

                      <div className="find-mates-game-info">
                        <strong>
                          {
                            game.gameName
                          }
                        </strong>

                        <span>
                          {game.platformName ??
                            "Plateforme non définie"}
                        </span>
                      </div>

                      {game.is_primary && (
                        <span className="find-mates-primary-badge">
                          Principal
                        </span>
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </section>

          <section className="find-mates-filter-card">
            <div className="find-mates-filter-heading">
              <span>
                Filtres rapides
              </span>
            </div>

            <FilterToggle
              label="Micro obligatoire"
              description="Afficher uniquement les joueurs avec micro"
              active={micOnly}
              onChange={() =>
                setMicOnly(
                  (value) =>
                    !value
                )
              }
            />

            <FilterToggle
              label="Crossplay"
              description="Autoriser les autres plateformes si le crossplay est activé"
              active={
                crossplayOnly
              }
              onChange={() =>
                setCrossplayOnly(
                  (value) =>
                    !value
                )
              }
            />
          </section>

          <section className="find-mates-filter-card">
            <div className="find-mates-filter-heading">
              <span>
                Ton profil de recherche
              </span>
            </div>

            <div className="find-mates-small-label">
              Gaming DNA
            </div>

            <div className="find-mates-tag-list">
              {gamingDna.length >
              0 ? (
                gamingDna.map(
                  (tag) => (
                    <span
                      className="find-mates-tag"
                      key={tag.id}
                    >
                      {tag.name}
                    </span>
                  )
                )
              ) : (
                <span className="find-mates-muted">
                  Aucun Gaming DNA
                </span>
              )}
            </div>

            <div className="find-mates-small-label">
              Tu recherches
            </div>

            <div className="find-mates-tag-list">
              {lookingFor.length >
              0 ? (
                lookingFor.map(
                  (option) => (
                    <span
                      className="find-mates-tag secondary"
                      key={
                        option.id
                      }
                    >
                      {
                        option.label
                      }
                    </span>
                  )
                )
              ) : (
                <span className="find-mates-muted">
                  Aucune préférence
                </span>
              )}
            </div>
          </section>
        </aside>

        <main className="find-mates-results">
          <div className="find-mates-results-header">
            <div>
              <span className="find-mates-eyebrow">
                RÉSULTATS
              </span>

              <h2>
                {selectedGame?.gameName
                  ? `Joueurs ${selectedGame.gameName}`
                  : "Joueurs"}
              </h2>
            </div>
          </div>

          {loading && (
            <div className="find-mates-state-card">
              <div className="find-mates-loader" />

              <strong>
                Recherche des joueurs...
              </strong>

              <span>
                GameMate consulte les
                profils disponibles.
              </span>
            </div>
          )}

          {!loading &&
            error && (
              <div className="find-mates-state-card error">
                <strong>
                  Une erreur est
                  survenue
                </strong>

                <span>
                  {error}
                </span>
              </div>
            )}

          {!loading &&
            !error &&
            filteredMates.length ===
              0 && (
              <div className="find-mates-state-card">
                <div className="find-mates-empty-icon">
                  GM
                </div>

                <strong>
                  Aucun mate trouvé pour
                  le moment
                </strong>

                <span>
                  Essaie un autre jeu ou
                  retire certains
                  filtres.
                </span>
              </div>
            )}

          {!loading &&
            !error &&
            filteredMates.length >
              0 && (
              <div className="find-mates-profile-grid">
                {filteredMates.map(
                  (mate) => (
                    <MateCard
                      key={`${mate.user_id}-${mate.game_id}`}
                      mate={mate}
                      onOpenProfile={
                        onOpenProfile
                      }
                    />
                  )
                )}
              </div>
            )}
        </main>
      </div>
    </div>
  );
}

type FilterToggleProps = {
  label: string;
  description: string;
  active: boolean;
  onChange: () => void;
};

function FilterToggle({
  label,
  description,
  active,
  onChange,
}: FilterToggleProps) {
  return (
    <button
      type="button"
      className="find-mates-toggle-row"
      onClick={onChange}
    >
      <div>
        <strong>
          {label}
        </strong>

        <span>
          {description}
        </span>
      </div>

      <span
        className={`find-mates-toggle ${
          active
            ? "active"
            : ""
        }`}
      >
        <span />
      </span>
    </button>
  );
}

function MateCard({
  mate,
  onOpenProfile,
}: {
  mate: MateProfile;
  onOpenProfile: (
    userId: string
  ) => void;
}) {
  const displayName =
    mate.display_name ||
    mate.username ||
    "Joueur GameMate";

  const initial =
    displayName
      .trim()
      .slice(0, 1)
      .toUpperCase() || "G";

  return (
    <article className="find-mates-profile-card">
      <div className="find-mates-profile-top">
        <div className="find-mates-avatar-wrap">
          {mate.avatar_url ? (
            <img
              src={
                mate.avatar_url
              }
              alt={
                displayName
              }
              className="find-mates-avatar"
            />
          ) : (
            <div className="find-mates-avatar-placeholder">
              {initial}
            </div>
          )}

          <span className="find-mates-online-dot" />
        </div>

        <div className="find-mates-profile-identity">
          <div className="find-mates-profile-name-row">
            <h3>
              {displayName}
            </h3>

            {mate.is_primary && (
              <span className="find-mates-primary-badge">
                Jeu principal
              </span>
            )}
          </div>

          {mate.username && (
            <span className="find-mates-username">
              @{mate.username}
            </span>
          )}

          <div className="find-mates-location">
            {mate.region && (
              <span>
                {mate.region}
              </span>
            )}

            {mate.language && (
              <>
                <span className="find-mates-dot-separator">
                  •
                </span>

                <span>
                  {mate.language.toUpperCase()}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {mate.bio && (
        <p className="find-mates-profile-bio">
          {mate.bio}
        </p>
      )}

      <div className="find-mates-profile-game">
        <div>
          <span className="find-mates-detail-label">
            Jeu
          </span>

          <strong>
            {mate.game_name}
          </strong>
        </div>

        <div>
          <span className="find-mates-detail-label">
            Plateforme
          </span>

          <strong>
            {mate.platform_name ??
              "Non définie"}
          </strong>
        </div>
      </div>

      <div className="find-mates-profile-details">
        <ProfileDetail
          label="Rang"
          value={
            mate.rank_text
          }
        />

        <ProfileDetail
          label="Rôle"
          value={
            mate.role_text
          }
        />

        <ProfileDetail
          label="Mode"
          value={
            mate.mode_text
          }
        />
      </div>

      <div className="find-mates-profile-badges">
        <span
          className={`find-mates-status-badge ${
            mate.mic_enabled
              ? "enabled"
              : ""
          }`}
        >
          {mate.mic_enabled
            ? "Micro"
            : "Sans micro"}
        </span>

        <span
          className={`find-mates-status-badge ${
            mate.crossplay_enabled
              ? "enabled"
              : ""
          }`}
        >
          {mate.crossplay_enabled
            ? "Crossplay"
            : "Même plateforme"}
        </span>
      </div>

      <div className="find-mates-card-actions">
        <button
          type="button"
          className="find-mates-secondary-button"
          onClick={() =>
            onOpenProfile(
              mate.user_id
            )
          }
        >
          Voir le profil
        </button>

        <button
          type="button"
          className="find-mates-primary-button"
          disabled
          title="Les invitations seront ajoutées prochainement"
        >
          Inviter
        </button>
      </div>
    </article>
  );
}

function ProfileDetail({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="find-mates-profile-detail">
      <span>
        {label}
      </span>

      <strong>
        {value ||
          "Non renseigné"}
      </strong>
    </div>
  );
}

export default FindMatesPage;