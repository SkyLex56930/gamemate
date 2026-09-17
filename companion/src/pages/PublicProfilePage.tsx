import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./PublicProfilePage.css";

type PublicGame = {
  game_id: number;
  game_name: string;

  platform_id: number | null;
  platform_name: string | null;

  is_primary: boolean;

  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;

  mic_enabled: boolean;
  crossplay_enabled: boolean;
};

type PublicGamingDna = {
  id: number | string;
  name: string;
  category: string;
};

type PublicLookingFor = {
  id: number | string;
  label: string;
  slug: string;
};

type PublicProfile = {
  user_id: string;

  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;

  region: string | null;
  language: string | null;

  games: PublicGame[];
  gaming_dna: PublicGamingDna[];
  looking_for: PublicLookingFor[];
};

type Props = {
  userId: string;
  onBack: () => void;
};

function PublicProfilePage({
  userId,
  onBack,
}: Props) {
  const [profile, setProfile] =
    useState<PublicProfile | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "get_public_profile",
        {
          p_user_id: userId,
        }
      );

      if (cancelled) {
        return;
      }

      if (rpcError) {
        console.error(
          "get_public_profile error:",
          rpcError
        );

        setError(
          "Impossible de charger ce profil."
        );

        setProfile(null);
        setLoading(false);

        return;
      }

      if (!data) {
        setError(
          "Ce profil n'existe pas ou n'est plus disponible."
        );

        setProfile(null);
        setLoading(false);

        return;
      }

      setProfile(data as PublicProfile);
      setLoading(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="public-profile-page">
        <button
          type="button"
          className="public-profile-back"
          onClick={onBack}
        >
          ← Retour
        </button>

        <div className="public-profile-state">
          <div className="public-profile-loader" />

          <strong>
            Chargement du profil...
          </strong>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="public-profile-page">
        <button
          type="button"
          className="public-profile-back"
          onClick={onBack}
        >
          ← Retour
        </button>

        <div className="public-profile-state error">
          <strong>
            Profil indisponible
          </strong>

          <span>
            {error ??
              "Impossible de charger ce profil."}
          </span>
        </div>
      </div>
    );
  }

  const displayName =
    profile.display_name ||
    profile.username ||
    "Joueur GameMate";

  const initial =
    displayName
      .trim()
      .slice(0, 1)
      .toUpperCase() || "G";

  const primaryGame =
    profile.games.find(
      (game) => game.is_primary
    ) ??
    profile.games[0] ??
    null;

  return (
    <div className="public-profile-page">
      <button
        type="button"
        className="public-profile-back"
        onClick={onBack}
      >
        ← Retour aux résultats
      </button>

      <section className="public-profile-hero">
        <div className="public-profile-hero-glow" />

        <div className="public-profile-main">
          <div className="public-profile-avatar-wrap">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="public-profile-avatar"
              />
            ) : (
              <div className="public-profile-avatar-placeholder">
                {initial}
              </div>
            )}

            <span className="public-profile-online-dot" />
          </div>

          <div className="public-profile-identity">
            <span className="public-profile-eyebrow">
              PROFIL GAMEMATE
            </span>

            <h1>{displayName}</h1>

            {profile.username && (
              <div className="public-profile-username">
                @{profile.username}
              </div>
            )}

            <div className="public-profile-meta">
              {profile.region && (
                <span>{profile.region}</span>
              )}

              {profile.language && (
                <>
                  <span>•</span>

                  <span>
                    {profile.language.toUpperCase()}
                  </span>
                </>
              )}

              {primaryGame && (
                <>
                  <span>•</span>

                  <span>
                    {primaryGame.game_name}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="public-profile-actions">
            <button
              type="button"
              className="public-profile-action secondary"
              disabled
            >
              Ajouter
            </button>

            <button
              type="button"
              className="public-profile-action secondary"
              disabled
            >
              Message
            </button>

            <button
              type="button"
              className="public-profile-action primary"
              disabled
            >
              Inviter
            </button>
          </div>
        </div>

        {profile.bio && (
          <p className="public-profile-bio">
            {profile.bio}
          </p>
        )}
      </section>

      <div className="public-profile-grid">
        <div className="public-profile-main-column">
          <section className="public-profile-card">
            <div className="public-profile-section-title">
              <div>
                <span className="public-profile-eyebrow">
                  JEUX
                </span>

                <h2>Jeux & plateformes</h2>
              </div>

              <span className="public-profile-count">
                {profile.games.length}
              </span>
            </div>

            {profile.games.length === 0 ? (
              <div className="public-profile-empty">
                Aucun jeu renseigné.
              </div>
            ) : (
              <div className="public-profile-games">
                {profile.games.map(
                  (game) => (
                    <GameCard
                      key={`${game.game_id}-${game.platform_id ?? "none"}`}
                      game={game}
                    />
                  )
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="public-profile-side-column">
          <section className="public-profile-card">
            <span className="public-profile-eyebrow">
              GAMING DNA
            </span>

            <h2>Style de joueur</h2>

            {profile.gaming_dna.length >
            0 ? (
              <div className="public-profile-tags">
                {profile.gaming_dna.map(
                  (tag) => (
                    <span
                      key={String(tag.id)}
                      className="public-profile-tag"
                    >
                      {tag.name}
                    </span>
                  )
                )}
              </div>
            ) : (
              <div className="public-profile-empty">
                Aucun Gaming DNA renseigné.
              </div>
            )}
          </section>

          <section className="public-profile-card">
            <span className="public-profile-eyebrow">
              RECHERCHE
            </span>

            <h2>Ce qu'il recherche</h2>

            {profile.looking_for.length >
            0 ? (
              <div className="public-profile-tags">
                {profile.looking_for.map(
                  (option) => (
                    <span
                      key={String(option.id)}
                      className="public-profile-tag cyan"
                    >
                      {option.label}
                    </span>
                  )
                )}
              </div>
            ) : (
              <div className="public-profile-empty">
                Aucune préférence publique.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function GameCard({
  game,
}: {
  game: PublicGame;
}) {
  return (
    <article
      className={`public-profile-game ${
        game.is_primary
          ? "primary"
          : ""
      }`}
    >
      <div className="public-profile-game-header">
        <div className="public-profile-game-icon">
          {game.game_name
            .slice(0, 1)
            .toUpperCase()}
        </div>

        <div className="public-profile-game-title">
          <div>
            <h3>{game.game_name}</h3>

            <span>
              {game.platform_name ??
                "Plateforme non renseignée"}
            </span>
          </div>

          {game.is_primary && (
            <span className="public-profile-primary-badge">
              Principal
            </span>
          )}
        </div>
      </div>

      <div className="public-profile-game-details">
        <GameDetail
          label="Rang"
          value={game.rank_text}
        />

        <GameDetail
          label="Rôle"
          value={game.role_text}
        />

        <GameDetail
          label="Mode"
          value={game.mode_text}
        />
      </div>

      <div className="public-profile-game-badges">
        <span
          className={
            game.mic_enabled
              ? "active"
              : ""
          }
        >
          {game.mic_enabled
            ? "Micro"
            : "Sans micro"}
        </span>

        <span
          className={
            game.crossplay_enabled
              ? "active"
              : ""
          }
        >
          {game.crossplay_enabled
            ? "Crossplay"
            : "Même plateforme"}
        </span>
      </div>
    </article>
  );
}

function GameDetail({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="public-profile-game-detail">
      <span>{label}</span>

      <strong>
        {value || "Non renseigné"}
      </strong>
    </div>
  );
}

export default PublicProfilePage;