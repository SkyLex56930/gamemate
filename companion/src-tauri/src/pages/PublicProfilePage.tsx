import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./PublicProfilePage.css";

type Props = {
  userId: string;
  onBack: () => void;
};

type PublicProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  equipped_frame_id: string | null;
  equipped_banner_cosmetic_id: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
  game_name: string | null;
  platform_name: string | null;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean | null;
  crossplay_enabled: boolean | null;
};

export default function PublicProfilePage({ userId, onBack }: Props) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [rows, setRows] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");

      const publicResult = await supabase.rpc("get_public_profile", {
        p_user_id: userId,
      });

      if (!mounted) return;

      if (!publicResult.error && publicResult.data) {
        const normalized = normalizePublicResult(publicResult.data, userId);

        if (normalized.length > 0) {
          setRows(normalized);
          setProfile(normalized[0]);
          setLoading(false);
          return;
        }
      }

      const fallback = await supabase.rpc("find_mates_profiles", {
        p_game_id: null,
      });

      if (!mounted) return;

      if (fallback.error) {
        console.error("Public profile:", publicResult.error, fallback.error);
        setError("Impossible de charger ce profil public.");
        setLoading(false);
        return;
      }

      const matches = ((fallback.data ?? []) as PublicProfile[]).filter(
        (item) => item.user_id === userId
      );

      if (matches.length === 0) {
        setError("Ce profil n’est pas disponible publiquement.");
        setLoading(false);
        return;
      }

      setRows(matches);
      setProfile(matches[0]);
      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const games = useMemo(() => {
    const seen = new Set<string>();

    return rows.filter((row) => {
      const key = `${row.game_name ?? ""}-${row.platform_name ?? ""}`;
      if (!row.game_name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows]);

  if (loading) {
    return (
      <section className="pub2 pub2-loading">
        <span className="pub2-loader" />
        <strong>Chargement du profil joueur...</strong>
      </section>
    );
  }

  if (!profile || error) {
    return (
      <section className="pub2 pub2-error-state">
        <span className="pub2-kicker">PROFIL JOUEUR</span>
        <h1>Profil indisponible</h1>
        <p>{error || "Impossible de charger ce profil."}</p>
        <button type="button" onClick={onBack}>
          ← Retour
        </button>
      </section>
    );
  }

  const name =
    profile.display_name || profile.username || "Joueur GameMate";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div className="pub2">
      <div className="pub2-grid" />
      <div className="pub2-orb a" />
      <div className="pub2-orb b" />

      <button type="button" className="pub2-back" onClick={onBack}>
        <span>←</span>
        Retour aux mates
      </button>

      <section className="pub2-hero">
        <div className="pub2-hero-scan" />

        <div className="pub2-avatar">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={name} />
          ) : (
            initial
          )}
        </div>

        <div className="pub2-identity">
          <span className="pub2-kicker">PROFIL GAMEMATE</span>
          <h1>{name}</h1>

          <div className="pub2-meta">
            {profile.username && <span>@{profile.username}</span>}
            {profile.region && <span>⌖ {profile.region}</span>}
            {profile.language && <span>◇ {profile.language}</span>}
          </div>

          <p>{profile.bio || "Aucune bio publique renseignée."}</p>
        </div>

        <div className="pub2-safety-note">
          <span className="pub2-kicker">CONFIDENTIALITÉ</span>
          <strong>Profil public</strong>
          <small>
            Seules les informations prévues pour la découverte sont affichées.
          </small>
        </div>
      </section>

      <div className="pub2-layout">
        <main className="pub2-main">
          <section className="pub2-panel">
            <header>
              <span className="pub2-kicker">JEUX</span>
              <h2>Joue actuellement</h2>
            </header>

            {games.length ? (
              <div className="pub2-games">
                {games.map((game, index) => (
                  <article
                    className="pub2-game"
                    key={`${game.game_name}-${game.platform_name}-${index}`}
                  >
                    <span className="pub2-game-mark">
                      {(game.game_name ?? "GM").slice(0, 2).toUpperCase()}
                    </span>

                    <div className="pub2-game-copy">
                      <strong>{game.game_name}</strong>
                      <small>
                        {game.platform_name ?? "Plateforme non renseignée"}
                      </small>
                    </div>

                    <div className="pub2-game-data">
                      {game.rank_text && (
                        <Info label="Rang" value={game.rank_text} />
                      )}
                      {game.role_text && (
                        <Info label="Rôle" value={game.role_text} />
                      )}
                      {game.mode_text && (
                        <Info label="Mode" value={game.mode_text} />
                      )}
                    </div>

                    <div className="pub2-flags">
                      {game.mic_enabled && <span>◉ Micro</span>}
                      {game.crossplay_enabled && <span>↔ Crossplay</span>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="pub2-empty">
                Aucun jeu public disponible pour ce profil.
              </div>
            )}
          </section>
        </main>

        <aside className="pub2-side">
          <section className="pub2-panel">
            <span className="pub2-kicker">À PROPOS</span>
            <h2>Repères joueur</h2>

            <div className="pub2-facts">
              <Fact label="Région" value={profile.region || "Non renseignée"} />
              <Fact
                label="Langue"
                value={profile.language || "Non renseignée"}
              />
              <Fact
                label="Jeux visibles"
                value={String(games.length)}
              />
            </div>
          </section>

          <section className="pub2-panel pub2-actions-note">
            <span className="pub2-kicker">SOCIAL</span>
            <h2>Actions joueur</h2>
            <p>
              Les boutons Message, Ajouter et Inviter seront affichés ici
              uniquement lorsqu’ils seront reliés à de vraies fonctions.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="pub2-info">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="pub2-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizePublicResult(data: unknown, userId: string): PublicProfile[] {
  const raw = Array.isArray(data) ? data : [data];

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      user_id: String(item.user_id ?? item.id ?? userId),
      username: nullableString(item.username),
      display_name: nullableString(item.display_name),
      avatar_url: nullableString(item.avatar_url),
      bio: nullableString(item.bio),
      region: nullableString(item.region),
      language: nullableString(item.language),
      game_name: nullableString(item.game_name),
      platform_name: nullableString(item.platform_name),
      rank_text: nullableString(item.rank_text),
      role_text: nullableString(item.role_text),
      mode_text: nullableString(item.mode_text),
      mic_enabled: nullableBoolean(item.mic_enabled),
      crossplay_enabled: nullableBoolean(item.crossplay_enabled),
    }));
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
