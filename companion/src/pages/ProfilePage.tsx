import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./ProfilePage.css";

type Profile = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  equipped_frame_id?: string | null;
  equipped_banner_cosmetic_id?: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
};

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
type AvailabilityRow = { day_of_week: number; start_time: string; end_time: string; timezone: string };
type LookingForOption = { id: string; label: string; slug: string };

type Cosmetic = {
  id: string;
  slug: string;
  name: string;
  cosmetic_type: "frame" | "banner";
  rarity: "common" | "rare" | "epic" | "legendary";
  unlock_method: "objective" | "purchase" | "granted";
  unlock_label: string | null;
  price_eur_cents: number | null;
  style: {
    class?: string;
    accent?: string;
    gradient?: string;
  } | null;
};

type Objective = {
  id: string;
  key: string;
  title: string;
  description: string;
  target_value: number;
  reward_cosmetic_id: string | null;
  sort_order: number;
};

type ObjectiveProgress = {
  objective_id: string;
  progress: number;
  completed_at: string | null;
  claimed_at: string | null;
};

type Props = {
  session: Session | null;
  profile: Profile | null;
  displayName: string;
  avatarLetter: string;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  availability: AvailabilityRow[];
  lookingFor: LookingForOption[];
  loading: boolean;
  onLogin: () => void;
};

const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function ProfilePage({
  session,
  profile,
  displayName,
  avatarLetter,
  userGames,
  gamingDna,
  availability,
  loading,
  onLogin,
}: Props) {
  const [tab, setTab] = useState<"profile" | "library">("profile");
  const [localProfile, setLocalProfile] = useState<Profile | null>(profile);
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [progress, setProgress] = useState<ObjectiveProgress[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<"all" | "owned" | "frames" | "banners">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setLocalProfile(profile), [profile]);

  useEffect(() => {
    if (!session?.user?.id) return;
    void loadCustomization();
  }, [session?.user?.id]);

  const equippedFrame = useMemo(
    () => cosmetics.find((item) => item.id === localProfile?.equipped_frame_id) ?? null,
    [cosmetics, localProfile?.equipped_frame_id]
  );

  const equippedBanner = useMemo(
    () => cosmetics.find((item) => item.id === localProfile?.equipped_banner_cosmetic_id) ?? null,
    [cosmetics, localProfile?.equipped_banner_cosmetic_id]
  );

  const filteredCosmetics = useMemo(() => {
    return cosmetics.filter((item) => {
      if (libraryFilter === "owned") return ownedIds.has(item.id);
      if (libraryFilter === "frames") return item.cosmetic_type === "frame";
      if (libraryFilter === "banners") return item.cosmetic_type === "banner";
      return true;
    });
  }, [cosmetics, ownedIds, libraryFilter]);

  async function loadCustomization() {
    if (!session?.user?.id) return;
    setError("");

    await supabase.rpc("sync_profile_objectives");

    const [profileRes, cosmeticsRes, ownedRes, objectivesRes, progressRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, display_name, avatar_url, banner_url, equipped_frame_id, equipped_banner_cosmetic_id, bio, region, language")
        .eq("id", session.user.id)
        .single(),
      supabase
        .from("profile_cosmetics")
        .select("id, slug, name, cosmetic_type, rarity, unlock_method, unlock_label, price_eur_cents, style")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_cosmetics")
        .select("cosmetic_id")
        .eq("user_id", session.user.id),
      supabase
        .from("profile_objectives")
        .select("id, key, title, description, target_value, reward_cosmetic_id, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("user_objective_progress")
        .select("objective_id, progress, completed_at, claimed_at")
        .eq("user_id", session.user.id),
    ]);

    if (profileRes.error) setError(profileRes.error.message);
    else setLocalProfile(profileRes.data as Profile);

    if (cosmeticsRes.error) setError(cosmeticsRes.error.message);
    else setCosmetics((cosmeticsRes.data ?? []) as Cosmetic[]);

    if (ownedRes.error) setError(ownedRes.error.message);
    else setOwnedIds(new Set((ownedRes.data ?? []).map((row) => row.cosmetic_id)));

    if (objectivesRes.error) setError(objectivesRes.error.message);
    else setObjectives((objectivesRes.data ?? []) as Objective[]);

    if (progressRes.error) setError(progressRes.error.message);
    else setProgress((progressRes.data ?? []) as ObjectiveProgress[]);
  }

  async function uploadProfileImage(kind: "avatar" | "banner", file: File) {
    if (!session?.user?.id) return;
    setError("");
    setNotice("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Format accepté : JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("L'image doit faire moins de 5 Mo.");
      return;
    }

    setBusy(kind);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "webp";
      const path = `${session.user.id}/${kind}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("profile-media").getPublicUrl(path);
      const column = kind === "avatar" ? "avatar_url" : "banner_url";

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ [column]: data.publicUrl, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);

      if (updateError) throw updateError;

      setLocalProfile((current) => current ? { ...current, [column]: data.publicUrl } : current);
      setNotice(kind === "avatar" ? "Avatar mis à jour." : "Bannière mise à jour.");
      window.dispatchEvent(new Event("gamemate-profile-updated"));
      await supabase.rpc("sync_profile_objectives");
      await loadCustomization();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'envoyer l'image.");
    } finally {
      setBusy(null);
    }
  }

  async function equipCosmetic(cosmetic: Cosmetic | null, slot: "frame" | "banner") {
    setBusy(`equip-${slot}`);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("equip_profile_cosmetic", {
      p_cosmetic_id: cosmetic?.id ?? null,
      p_slot: slot,
    });

    if (rpcError) setError(rpcError.message);
    else {
      setNotice(cosmetic ? `${cosmetic.name} équipé.` : `${slot === "frame" ? "Cadre" : "Bannière"} retiré.`);
      await loadCustomization();
      window.dispatchEvent(new Event("gamemate-profile-updated"));
    }
    setBusy(null);
  }

  async function claimObjective(objective: Objective) {
    setBusy(`claim-${objective.id}`);
    setError("");
    setNotice("");

    const { error: claimError } = await supabase.rpc("claim_objective_reward", {
      p_objective_id: objective.id,
    });

    if (claimError) setError(claimError.message);
    else {
      setNotice("Récompense ajoutée à ta bibliothèque.");
      await loadCustomization();
    }
    setBusy(null);
  }

  if (!session) {
    return (
      <section className="prc locked">
        <div>
          <span className="prc-eyebrow">MON PROFIL</span>
          <h1>Personnalise ton identité GameMate.</h1>
          <p>Connecte-toi pour accéder à ton profil et à ta bibliothèque.</p>
          <button className="prc-btn primary" type="button" onClick={onLogin}>Se connecter</button>
        </div>
      </section>
    );
  }

  if (loading && !localProfile) {
    return <section className="prc loading">Chargement du profil...</section>;
  }

  const bannerStyle = equippedBanner?.style?.gradient
    ? { backgroundImage: equippedBanner.style.gradient }
    : localProfile?.banner_url
      ? { backgroundImage: `linear-gradient(90deg,rgba(3,10,20,.42),rgba(12,8,31,.34)),url("${localProfile.banner_url}")` }
      : undefined;

  return (
    <div className="prc">
      <section className={`prc-banner ${equippedBanner?.style?.class ?? ""}`} style={bannerStyle}>
        <div className="prc-banner-overlay" />

        <div className="prc-identity">
          <div className={`prc-avatar-frame ${equippedFrame?.style?.class ?? ""}`}>
            <div className="prc-avatar">
              {localProfile?.avatar_url ? <img src={localProfile.avatar_url} alt={displayName} /> : avatarLetter}
            </div>
          </div>

          <div className="prc-name">
            <span className="prc-eyebrow">PROFIL GAMEMATE</span>
            <h1>{displayName}</h1>
            <p>
              {localProfile?.username ? `@${localProfile.username}` : "Compte GameMate"}
              {localProfile?.region ? ` · ${localProfile.region}` : ""}
            </p>
          </div>
        </div>

        <div className="prc-media-actions">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadProfileImage("avatar", file);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadProfileImage("banner", file);
              event.currentTarget.value = "";
            }}
          />

          <button type="button" disabled={busy === "avatar"} onClick={() => avatarInputRef.current?.click()}>
            {busy === "avatar" ? "Envoi..." : "Changer l’avatar"}
          </button>
          <button type="button" disabled={busy === "banner"} onClick={() => bannerInputRef.current?.click()}>
            {busy === "banner" ? "Envoi..." : "Changer la bannière"}
          </button>
        </div>
      </section>

      <nav className="prc-tabs">
        <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
          Profil
        </button>
        <button type="button" className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          Bibliothèque
          {ownedIds.size > 0 && <span>{ownedIds.size}</span>}
        </button>
      </nav>

      {(notice || error) && (
        <div className={`prc-notice ${error ? "error" : ""}`}>
          {error || notice}
        </div>
      )}

      {tab === "profile" ? (
        <div className="prc-profile-view">
          <main>
            <section className="prc-card">
              <header>
                <div>
                  <span className="prc-eyebrow">À PROPOS</span>
                  <h2>Mon profil</h2>
                </div>
              </header>
              <p className="prc-bio">
                {localProfile?.bio || "Ajoute une bio pour te présenter aux autres joueurs."}
              </p>
              <div className="prc-tags">
                {gamingDna.slice(0, 8).map((tag) => <span key={tag.id}>{tag.name}</span>)}
              </div>
            </section>

            <section className="prc-card">
              <header>
                <div>
                  <span className="prc-eyebrow">JEUX</span>
                  <h2>Ma bibliothèque</h2>
                </div>
              </header>

              {userGames.length > 0 ? (
                <div className="prc-games">
                  {userGames.slice(0, 6).map((game) => (
                    <div key={`${game.game_id}-${game.platform_id ?? "none"}`}>
                      <span>{game.gameName.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{game.gameName}</strong>
                        <small>{game.platformName ?? "Plateforme non renseignée"}</small>
                      </div>
                      {game.is_primary && <i>Principal</i>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="prc-empty">Aucun jeu configuré.</div>
              )}
            </section>
          </main>

          <aside>
            <section className="prc-card">
              <header>
                <div>
                  <span className="prc-eyebrow">PERSONNALISATION</span>
                  <h2>Équipé</h2>
                </div>
              </header>

              <div className="prc-equipped">
                <div>
                  <span>Cadre</span>
                  <strong>{equippedFrame?.name ?? "Aucun"}</strong>
                  {equippedFrame && <button type="button" onClick={() => void equipCosmetic(null, "frame")}>Retirer</button>}
                </div>
                <div>
                  <span>Bannière</span>
                  <strong>{equippedBanner?.name ?? (localProfile?.banner_url ? "Image personnelle" : "Aucune")}</strong>
                  {equippedBanner && <button type="button" onClick={() => void equipCosmetic(null, "banner")}>Utiliser mon image</button>}
                </div>
              </div>

              <button className="prc-btn full" type="button" onClick={() => setTab("library")}>
                Ouvrir la bibliothèque
              </button>
            </section>

            {availability.length > 0 && (
              <section className="prc-card">
                <header>
                  <div>
                    <span className="prc-eyebrow">DISPONIBILITÉS</span>
                    <h2>Mes créneaux</h2>
                  </div>
                </header>
                <div className="prc-slots">
                  {availability.slice(0, 4).map((slot, index) => (
                    <div key={`${slot.day_of_week}-${slot.start_time}-${index}`}>
                      <strong>{days[slot.day_of_week]}</strong>
                      <span>{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      ) : (
        <div className="prc-library">
          <section className="prc-library-top">
            <div>
              <span className="prc-eyebrow">COSMÉTIQUES</span>
              <h2>Ma bibliothèque</h2>
              <p>Équipe les éléments obtenus et découvre ceux à débloquer.</p>
            </div>
            <div className="prc-library-filters">
              {(["all","owned","frames","banners"] as const).map((filter) => (
                <button key={filter} type="button" className={libraryFilter === filter ? "active" : ""} onClick={() => setLibraryFilter(filter)}>
                  {filter === "all" ? "Tout" : filter === "owned" ? "Possédés" : filter === "frames" ? "Cadres" : "Bannières"}
                </button>
              ))}
            </div>
          </section>

          <section className="prc-cosmetic-grid">
            {filteredCosmetics.map((item) => {
              const owned = ownedIds.has(item.id);
              const equipped = item.cosmetic_type === "frame"
                ? localProfile?.equipped_frame_id === item.id
                : localProfile?.equipped_banner_cosmetic_id === item.id;

              return (
                <article className={`prc-cosmetic ${item.rarity}`} key={item.id}>
                  <div className={`prc-cosmetic-preview ${item.style?.class ?? ""}`}>
                    {item.cosmetic_type === "frame" ? (
                      <div className={`prc-preview-frame ${item.style?.class ?? ""}`}>
                        <span>{avatarLetter}</span>
                      </div>
                    ) : (
                      <div className="prc-preview-banner" style={{ backgroundImage: item.style?.gradient ?? undefined }}>
                        <span>GameMate</span>
                      </div>
                    )}
                    <b>{item.rarity}</b>
                  </div>

                  <div className="prc-cosmetic-copy">
                    <span>{item.cosmetic_type === "frame" ? "CADRE" : "BANNIÈRE"}</span>
                    <h3>{item.name}</h3>
                    <p>{item.unlock_label ?? "Cosmétique GameMate"}</p>
                  </div>

                  <div className="prc-cosmetic-action">
                    {owned ? (
                      <button
                        type="button"
                        className={equipped ? "equipped" : ""}
                        disabled={equipped || busy === `equip-${item.cosmetic_type}`}
                        onClick={() => void equipCosmetic(item, item.cosmetic_type)}
                      >
                        {equipped ? "Équipé" : "Équiper"}
                      </button>
                    ) : item.unlock_method === "purchase" ? (
                      <button type="button" disabled>
                        {item.price_eur_cents != null ? `${(item.price_eur_cents / 100).toFixed(2).replace(".", ",")} € · bientôt` : "Boutique bientôt"}
                      </button>
                    ) : (
                      <span className="locked-label">À débloquer</span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="prc-objectives">
            <header>
              <span className="prc-eyebrow">OBJECTIFS</span>
              <h2>Récompenses à obtenir</h2>
            </header>

            <div className="prc-objective-list">
              {objectives.map((objective) => {
                const current = progress.find((item) => item.objective_id === objective.id);
                const value = current?.progress ?? 0;
                const complete = Boolean(current?.completed_at) || value >= objective.target_value;
                const claimed = Boolean(current?.claimed_at) || Boolean(objective.reward_cosmetic_id && ownedIds.has(objective.reward_cosmetic_id));
                const reward = cosmetics.find((item) => item.id === objective.reward_cosmetic_id);

                return (
                  <div className="prc-objective" key={objective.id}>
                    <div className="prc-objective-copy">
                      <strong>{objective.title}</strong>
                      <p>{objective.description}</p>
                      <div className="prc-progress">
                        <i style={{ width: `${Math.min(100, Math.round((value / objective.target_value) * 100))}%` }} />
                      </div>
                      <small>{value} / {objective.target_value}</small>
                    </div>

                    <div className="prc-objective-reward">
                      <span>Récompense</span>
                      <strong>{reward?.name ?? "Cosmétique"}</strong>
                    </div>

                    <button
                      type="button"
                      disabled={!complete || claimed || busy === `claim-${objective.id}`}
                      onClick={() => void claimObjective(objective)}
                    >
                      {claimed ? "Obtenu" : complete ? "Récupérer" : "Verrouillé"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
