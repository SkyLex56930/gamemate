import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getProfileCompletion, type ProfileCompletionTask } from "../lib/profileCompletion";
import ProfilePrivacyPanel from "../components/ProfilePrivacyPanel";
import { Icon, type IconName } from "../components/Icon";
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
type CatalogItem = { id: string; name: string };

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

type SetupSection = "identity" | "games" | "preferences" | "availability";
type EditableGame = UserGame & {
  draftRank: string;
  draftRole: string;
  draftMode: string;
  draftMic: boolean;
  draftCrossplay: boolean;
  draftPrimary: boolean;
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
  lookingFor,
  loading,
  onLogin,
}: Props) {
  const [tab, setTab] = useState<"profile" | "setup" | "privacy" | "library">("profile");
  const [setupSection, setSetupSection] = useState<SetupSection>("identity");
  const [localProfile, setLocalProfile] = useState<Profile | null>(profile);
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [progress, setProgress] = useState<ObjectiveProgress[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<"all" | "owned" | "frames" | "banners">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [savingSetup, setSavingSetup] = useState(false);
  const [basicDraft, setBasicDraft] = useState({ username: "", display_name: "", bio: "", region: "", language: "" });
  const [gameDrafts, setGameDrafts] = useState<EditableGame[]>([]);
  const [gameCatalog, setGameCatalog] = useState<CatalogItem[]>([]);
  const [platformCatalog, setPlatformCatalog] = useState<CatalogItem[]>([]);
  const [dnaOptions, setDnaOptions] = useState<GamingDnaTag[]>([]);
  const [lookingOptions, setLookingOptions] = useState<LookingForOption[]>([]);
  const [selectedDnaIds, setSelectedDnaIds] = useState<string[]>([]);
  const [selectedLookingIds, setSelectedLookingIds] = useState<string[]>([]);
  const [availabilityDraft, setAvailabilityDraft] = useState({
    days: [] as number[],
    start: "18:00",
    end: "22:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris",
  });

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLocalProfile(profile);
    setBasicDraft({
      username: profile?.username ?? "",
      display_name: profile?.display_name ?? "",
      bio: profile?.bio ?? "",
      region: profile?.region ?? "",
      language: profile?.language ?? "",
    });
  }, [profile]);

  useEffect(() => {
    setGameDrafts(userGames.map((game) => ({
      ...game,
      draftRank: game.rank_text ?? "",
      draftRole: game.role_text ?? "",
      draftMode: game.mode_text ?? "",
      draftMic: game.mic_enabled,
      draftCrossplay: game.crossplay_enabled,
      draftPrimary: game.is_primary,
    })));
  }, [userGames]);

  useEffect(() => setSelectedDnaIds(gamingDna.map((tag) => tag.id)), [gamingDna]);
  useEffect(() => setSelectedLookingIds(lookingFor.map((option) => option.id)), [lookingFor]);
  useEffect(() => {
    if (!availability.length) return;
    setAvailabilityDraft({
      days: availability.map((slot) => slot.day_of_week),
      start: availability[0].start_time.slice(0, 5),
      end: availability[0].end_time.slice(0, 5),
      timezone: availability[0].timezone || "Europe/Paris",
    });
  }, [availability]);

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

  const completion = useMemo(
    () => getProfileCompletion({ profile: localProfile, userGames, gamingDna, availability, lookingFor }),
    [localProfile, userGames, gamingDna, availability, lookingFor]
  );

  async function loadCustomization() {
    if (!session?.user?.id) return;
    setError("");

    await supabase.rpc("sync_profile_objectives");

    const [profileRes, cosmeticsRes, ownedRes, objectivesRes, progressRes, dnaOptionsRes, lookingOptionsRes, gamesRes, platformsRes] = await Promise.all([
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
      supabase
        .from("gaming_dna_tags")
        .select("id, name, category")
        .order("category", { ascending: true }),
      supabase
        .from("looking_for_options")
        .select("id, label, slug")
        .order("label", { ascending: true }),
      supabase.from("games").select("id, name").order("name", { ascending: true }),
      supabase.from("platforms").select("id, name").order("name", { ascending: true }),
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

    if (!dnaOptionsRes.error) setDnaOptions((dnaOptionsRes.data ?? []) as GamingDnaTag[]);
    if (!lookingOptionsRes.error) setLookingOptions((lookingOptionsRes.data ?? []) as LookingForOption[]);
    if (!gamesRes.error) setGameCatalog((gamesRes.data ?? []) as CatalogItem[]);
    if (!platformsRes.error) setPlatformCatalog((platformsRes.data ?? []) as CatalogItem[]);
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

  function openSetup(section: SetupSection) {
    setSetupSection(section);
    setTab("setup");
    setNotice("");
    setError("");
  }

  async function finishSetup(message: string) {
    setNotice(message);
    window.dispatchEvent(new Event("gamemate-profile-updated"));
    await loadCustomization();
  }

  async function saveIdentity() {
    if (!session?.user?.id) return;
    if (!basicDraft.username.trim() || !basicDraft.display_name.trim()) {
      setError("Le pseudo et le nom affiché sont obligatoires.");
      return;
    }
    setSavingSetup(true);
    setError("");
    setNotice("");
    const { error: updateError } = await supabase.from("profiles").update({
      username: basicDraft.username.trim(),
      display_name: basicDraft.display_name.trim(),
      bio: basicDraft.bio.trim() || null,
      region: basicDraft.region.trim() || null,
      language: basicDraft.language.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", session.user.id);
    if (updateError) setError(updateError.message);
    else await finishSetup("Identité enregistrée.");
    setSavingSetup(false);
  }

  async function saveGames() {
    if (!session?.user?.id) return;
    if (!gameDrafts.length) {
      setError("Ajoute au moins un jeu à ton profil.");
      return;
    }
    setSavingSetup(true);
    setError("");
    setNotice("");
    try {
      const normalizedDrafts = gameDrafts.map((game, index) => ({
        ...game,
        draftPrimary: gameDrafts.some((item) => item.draftPrimary) ? game.draftPrimary : index === 0,
      }));

      const gameKey = (game: Pick<UserGame, "game_id" | "platform_id">) =>
        `${game.game_id}:${game.platform_id ?? "none"}`;
      const originalKeys = new Set(userGames.map(gameKey));
      const nextKeys = new Set(normalizedDrafts.map(gameKey));

      for (const game of normalizedDrafts) {
        const values = {
          rank_text: game.draftRank.trim() || null,
          role_text: game.draftRole.trim() || null,
          mode_text: game.draftMode.trim() || null,
          mic_enabled: game.draftMic,
          crossplay_enabled: game.draftCrossplay,
          is_primary: game.draftPrimary,
        };

        if (originalKeys.has(gameKey(game))) {
          let query = supabase.from("user_games").update(values)
            .eq("user_id", session.user.id)
            .eq("game_id", game.game_id);
          query = game.platform_id == null ? query.is("platform_id", null) : query.eq("platform_id", game.platform_id);
          const { error: updateError } = await query;
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from("user_games").insert({
            user_id: session.user.id,
            game_id: game.game_id,
            platform_id: game.platform_id,
            ...values,
          });
          if (insertError) throw insertError;
        }
      }

      for (const game of userGames.filter((item) => !nextKeys.has(gameKey(item)))) {
        let query = supabase.from("user_games").delete()
          .eq("user_id", session.user.id)
          .eq("game_id", game.game_id);
        query = game.platform_id == null ? query.is("platform_id", null) : query.eq("platform_id", game.platform_id);
        const { error: deleteError } = await query;
        if (deleteError) throw deleteError;
      }

      await finishSetup("Préférences de jeu enregistrées.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer les jeux.");
    }
    setSavingSetup(false);
  }

  async function savePreferences() {
    if (!session?.user?.id) return;
    if (selectedDnaIds.length > 8) {
      setError("Tu peux sélectionner jusqu'à 8 traits Gaming DNA.");
      return;
    }
    if (!selectedLookingIds.length) {
      setError("Sélectionne au moins une intention de recherche.");
      return;
    }
    setSavingSetup(true);
    setError("");
    setNotice("");
    try {
      const currentDnaIds = new Set(gamingDna.map((tag) => tag.id));
      const dnaToAdd = selectedDnaIds.filter((id) => !currentDnaIds.has(id));
      const dnaToRemove = gamingDna.map((tag) => tag.id).filter((id) => !selectedDnaIds.includes(id));
      if (dnaToAdd.length) {
        const { error: insertDnaError } = await supabase.from("user_gaming_dna").insert(
          dnaToAdd.map((tagId) => ({ user_id: session.user.id, tag_id: tagId }))
        );
        if (insertDnaError) throw insertDnaError;
      }
      if (dnaToRemove.length) {
        const { error: deleteDnaError } = await supabase.from("user_gaming_dna").delete()
          .eq("user_id", session.user.id).in("tag_id", dnaToRemove);
        if (deleteDnaError) throw deleteDnaError;
      }

      const currentLookingIds = new Set(lookingFor.map((option) => option.id));
      const lookingToAdd = selectedLookingIds.filter((id) => !currentLookingIds.has(id));
      const lookingToRemove = lookingFor.map((option) => option.id).filter((id) => !selectedLookingIds.includes(id));
      if (lookingToAdd.length) {
        const { error: insertLookingError } = await supabase.from("user_looking_for").insert(
          lookingToAdd.map((optionId) => ({ user_id: session.user.id, option_id: optionId }))
        );
        if (insertLookingError) throw insertLookingError;
      }
      if (lookingToRemove.length) {
        const { error: deleteLookingError } = await supabase.from("user_looking_for").delete()
          .eq("user_id", session.user.id).in("option_id", lookingToRemove);
        if (deleteLookingError) throw deleteLookingError;
      }
      await finishSetup("Gaming DNA et intentions enregistrés.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer les préférences.");
    }
    setSavingSetup(false);
  }

  async function saveAvailability() {
    if (!session?.user?.id) return;
    if (!availabilityDraft.days.length) {
      setError("Sélectionne au moins un jour.");
      return;
    }
    if (availabilityDraft.start >= availabilityDraft.end) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSavingSetup(true);
    setError("");
    setNotice("");
    try {
      const currentDays = new Set(availability.map((slot) => slot.day_of_week));
      for (const day of availabilityDraft.days) {
        const values = {
          start_time: availabilityDraft.start,
          end_time: availabilityDraft.end,
          timezone: availabilityDraft.timezone,
        };
        if (currentDays.has(day)) {
          const { error: updateError } = await supabase.from("user_availability").update(values)
            .eq("user_id", session.user.id).eq("day_of_week", day);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from("user_availability").insert({
            user_id: session.user.id,
            day_of_week: day,
            ...values,
          });
          if (insertError) throw insertError;
        }
      }
      const removedDays = availability.map((slot) => slot.day_of_week)
        .filter((day) => !availabilityDraft.days.includes(day));
      if (removedDays.length) {
        const { error: deleteError } = await supabase.from("user_availability").delete()
          .eq("user_id", session.user.id).in("day_of_week", removedDays);
        if (deleteError) throw deleteError;
      }
      await finishSetup("Disponibilités enregistrées.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer les disponibilités.");
    }
    setSavingSetup(false);
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

      <section className="prc-completion">
        <div className="prc-completion-ring" style={{ "--profile-progress": `${completion.percent * 3.6}deg` } as CSSProperties}>
          <span><strong>{completion.percent}%</strong><small>COMPLET</small></span>
        </div>
        <div className="prc-completion-copy">
          <span className="prc-eyebrow">PROGRESSION DU PROFIL</span>
          <h2>{completion.percent === 100 ? "Ton profil est prêt." : "Un meilleur profil, de meilleurs mates."}</h2>
          <p>{completion.nextTask ? completion.nextTask.description : "Toutes les informations importantes sont renseignées."}</p>
          <div><i style={{ width: `${completion.percent}%` }} /></div>
        </div>
        <div className="prc-completion-next">
          <small>{completion.completed} / {completion.total} ÉTAPES</small>
          {completion.nextTask ? (
            <button type="button" onClick={() => openSetup(completion.nextTask!.section)}>
              <span>Prochaine étape</span><strong>{completion.nextTask.label}</strong><Icon name="arrow-right" size={16} />
            </button>
          ) : <span className="prc-complete-badge"><Icon name="check" size={15} /> Profil complet</span>}
        </div>
      </section>

      <nav className="prc-tabs">
        <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
          Profil
        </button>
        <button type="button" className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>
          Configurer
          {completion.percent < 100 && <span>{completion.percent}%</span>}
        </button>
        <button type="button" className={tab === "privacy" ? "active" : ""} onClick={() => setTab("privacy")}>
          Confidentialité
        </button>
        <button type="button" className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          Bibliothèque
          {ownedIds.size > 0 && <span>{ownedIds.size}</span>}
        </button>
      </nav>

      {(notice || error) && (
        <div className={`prc-notice ${error ? "error" : ""}`}>
          {error || notice}
          {error && <button type="button" onClick={() => void loadCustomization()}>Réessayer</button>}
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
                  {equippedFrame && <button type="button" disabled={busy === "equip-frame"} onClick={() => void equipCosmetic(null, "frame")}>{busy === "equip-frame" ? "Mise à jour..." : "Déséquiper"}</button>}
                </div>
                <div>
                  <span>Bannière</span>
                  <strong>{equippedBanner?.name ?? (localProfile?.banner_url ? "Image personnelle" : "Aucune")}</strong>
                  {equippedBanner && <button type="button" disabled={busy === "equip-banner"} onClick={() => void equipCosmetic(null, "banner")}>{busy === "equip-banner" ? "Mise à jour..." : "Déséquiper"}</button>}
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
      ) : tab === "setup" ? (
        <ProfileSetup
          section={setupSection}
          onSectionChange={setSetupSection}
          completionTasks={completion.tasks}
          basicDraft={basicDraft}
          onBasicDraftChange={setBasicDraft}
          gameDrafts={gameDrafts}
          onGameDraftsChange={setGameDrafts}
          gameCatalog={gameCatalog}
          platformCatalog={platformCatalog}
          dnaOptions={dnaOptions}
          selectedDnaIds={selectedDnaIds}
          onSelectedDnaIdsChange={setSelectedDnaIds}
          lookingOptions={lookingOptions}
          selectedLookingIds={selectedLookingIds}
          onSelectedLookingIdsChange={setSelectedLookingIds}
          availabilityDraft={availabilityDraft}
          onAvailabilityDraftChange={setAvailabilityDraft}
          saving={savingSetup}
          onSaveIdentity={() => void saveIdentity()}
          onSaveGames={() => void saveGames()}
          onSavePreferences={() => void savePreferences()}
          onSaveAvailability={() => void saveAvailability()}
        />
      ) : tab === "privacy" ? (
        <ProfilePrivacyPanel />
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
                        disabled={busy === `equip-${item.cosmetic_type}`}
                        onClick={() =>
                          void equipCosmetic(
                            equipped ? null : item,
                            item.cosmetic_type
                          )
                        }
                      >
                        {busy === `equip-${item.cosmetic_type}`
                          ? "Mise à jour..."
                          : equipped
                            ? "Déséquiper"
                            : "Équiper"}
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

function ProfileSetup({
  section,
  onSectionChange,
  completionTasks,
  basicDraft,
  onBasicDraftChange,
  gameDrafts,
  onGameDraftsChange,
  gameCatalog,
  platformCatalog,
  dnaOptions,
  selectedDnaIds,
  onSelectedDnaIdsChange,
  lookingOptions,
  selectedLookingIds,
  onSelectedLookingIdsChange,
  availabilityDraft,
  onAvailabilityDraftChange,
  saving,
  onSaveIdentity,
  onSaveGames,
  onSavePreferences,
  onSaveAvailability,
}: {
  section: SetupSection;
  onSectionChange: (section: SetupSection) => void;
  completionTasks: ProfileCompletionTask[];
  basicDraft: { username: string; display_name: string; bio: string; region: string; language: string };
  onBasicDraftChange: (value: { username: string; display_name: string; bio: string; region: string; language: string }) => void;
  gameDrafts: EditableGame[];
  onGameDraftsChange: (value: EditableGame[]) => void;
  gameCatalog: CatalogItem[];
  platformCatalog: CatalogItem[];
  dnaOptions: GamingDnaTag[];
  selectedDnaIds: string[];
  onSelectedDnaIdsChange: (value: string[]) => void;
  lookingOptions: LookingForOption[];
  selectedLookingIds: string[];
  onSelectedLookingIdsChange: (value: string[]) => void;
  availabilityDraft: { days: number[]; start: string; end: string; timezone: string };
  onAvailabilityDraftChange: (value: { days: number[]; start: string; end: string; timezone: string }) => void;
  saving: boolean;
  onSaveIdentity: () => void;
  onSaveGames: () => void;
  onSavePreferences: () => void;
  onSaveAvailability: () => void;
}) {
  const [newGameId, setNewGameId] = useState("");
  const [newPlatformId, setNewPlatformId] = useState("");
  const groups: Array<{ id: SetupSection; label: string; icon: IconName; subtitle: string }> = [
    { id: "identity", label: "Identité", icon: "user", subtitle: "Pseudo, bio et localisation" },
    { id: "games", label: "Jeux", icon: "gamepad", subtitle: "Rang, rôle et plateforme" },
    { id: "preferences", label: "Style de jeu", icon: "sparkles", subtitle: "Gaming DNA et intentions" },
    { id: "availability", label: "Disponibilités", icon: "calendar-clock", subtitle: "Jours et horaires" },
  ];

  const isGroupDone = (id: SetupSection) =>
    completionTasks.filter((task) => task.section === id).every((task) => task.done);

  function updateGame(index: number, patch: Partial<EditableGame>) {
    onGameDraftsChange(gameDrafts.map((game, gameIndex) => {
      if (patch.draftPrimary && gameIndex !== index) return { ...game, draftPrimary: false };
      return gameIndex === index ? { ...game, ...patch } : game;
    }));
  }

  function addGame() {
  const game = gameCatalog.find(
    (item) => String(item.id) === String(newGameId)
  );

  const platform = platformCatalog.find(
    (item) => String(item.id) === String(newPlatformId)
  );

  if (!game || !platform) {
    return;
  }

  const gameId = String(game.id);
  const platformId = String(platform.id);

  if (
    gameDrafts.some(
      (item) =>
        String(item.game_id) === gameId &&
        String(item.platform_id) === platformId
    )
  ) {
    return;
  }

  onGameDraftsChange([
    ...gameDrafts,
    {
      game_id: gameId,
      platform_id: platformId,
      gameName: game.name,
      platformName: platform.name,
      is_primary: gameDrafts.length === 0,
      rank_text: null,
      role_text: null,
      mode_text: null,
      mic_enabled: true,
      crossplay_enabled: true,
      draftRank: "",
      draftRole: "",
      draftMode: "",
      draftMic: true,
      draftCrossplay: true,
      draftPrimary: gameDrafts.length === 0,
    },
  ]);

  setNewGameId("");
  setNewPlatformId("");
}

  function removeGame(index: number) {
    const next = gameDrafts.filter((_, gameIndex) => gameIndex !== index);
    if (next.length > 0 && !next.some((game) => game.draftPrimary)) next[0] = { ...next[0], draftPrimary: true };
    onGameDraftsChange(next);
  }

  function toggleDna(id: string) {
    if (selectedDnaIds.includes(id)) {
      onSelectedDnaIdsChange(selectedDnaIds.filter((value) => value !== id));
    } else if (selectedDnaIds.length < 8) {
      onSelectedDnaIdsChange([...selectedDnaIds, id]);
    }
  }

  function toggleLooking(id: string) {
    onSelectedLookingIdsChange(
      selectedLookingIds.includes(id)
        ? selectedLookingIds.filter((value) => value !== id)
        : [...selectedLookingIds, id]
    );
  }

  function toggleDay(day: number) {
    onAvailabilityDraftChange({
      ...availabilityDraft,
      days: availabilityDraft.days.includes(day)
        ? availabilityDraft.days.filter((value) => value !== day)
        : [...availabilityDraft.days, day].sort(),
    });
  }

  return (
    <div className="prc-setup">
      <aside className="prc-setup-nav">
        <div className="prc-setup-title">
          <span className="prc-eyebrow">CONFIGURATION</span>
          <h2>Construis ton profil</h2>
          <p>Chaque information aide GameMate à proposer de meilleurs joueurs.</p>
        </div>
        {groups.map((group) => (
          <button type="button" key={group.id} className={section === group.id ? "active" : ""} onClick={() => onSectionChange(group.id)}>
            <span><Icon name={group.icon} /></span>
            <span><strong>{group.label}</strong><small>{group.subtitle}</small></span>
            <i className={isGroupDone(group.id) ? "done" : ""}><Icon name={isGroupDone(group.id) ? "check" : "chevron-right"} size={15} /></i>
          </button>
        ))}
        <div className="prc-setup-hint"><span><Icon name="shield" /></span><p>Les champs privés ne sont jamais affichés sur ton profil public sans raison.</p></div>
      </aside>

      <main className="prc-setup-main">
        {section === "identity" && (
          <section className="prc-editor">
            <EditorHeader step="01" title="Ton identité GameMate" description="Ces informations apparaissent sur ton profil public et dans les résultats de recherche." />
            <div className="prc-form-grid two">
              <Field label="Pseudo" hint="Identifiant unique affiché avec @">
                <input value={basicDraft.username} onChange={(event) => onBasicDraftChange({ ...basicDraft, username: event.target.value })} placeholder="Ton pseudo" />
              </Field>
              <Field label="Nom affiché" hint="Le nom visible par les autres joueurs">
                <input value={basicDraft.display_name} onChange={(event) => onBasicDraftChange({ ...basicDraft, display_name: event.target.value })} placeholder="Ton nom GameMate" />
              </Field>
            </div>
            <Field label="Présentation" hint={`${basicDraft.bio.length}/240 caractères · 20 minimum recommandés`}>
              <textarea maxLength={240} value={basicDraft.bio} onChange={(event) => onBasicDraftChange({ ...basicDraft, bio: event.target.value })} placeholder="Ton style de jeu, ce que tu recherches, ton ambiance..." />
            </Field>
            <div className="prc-form-grid two">
              <Field label="Région" hint="Pays ou grande région, jamais ta position précise">
                <input value={basicDraft.region} onChange={(event) => onBasicDraftChange({ ...basicDraft, region: event.target.value })} placeholder="France · Ouest" />
              </Field>
              <Field label="Langue principale" hint="Langue utilisée en vocal">
                <input value={basicDraft.language} onChange={(event) => onBasicDraftChange({ ...basicDraft, language: event.target.value })} placeholder="Français" />
              </Field>
            </div>
            <EditorSave saving={saving} onSave={onSaveIdentity} />
          </section>
        )}

        {section === "games" && (
          <section className="prc-editor">
            <EditorHeader step="02" title="Tes jeux et préférences" description="Affinez chaque jeu existant pour que les filtres Rang et Rôle deviennent réellement utiles." />
            <div className="prc-add-game">
              <div><span className="prc-eyebrow">AJOUTER UN JEU</span><strong>Nouvelle configuration</strong></div>
              <select value={newGameId} onChange={(event) => setNewGameId(event.target.value)}>
                <option value="">Choisir un jeu</option>
                {gameCatalog.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
              </select>
              <select value={newPlatformId} onChange={(event) => setNewPlatformId(event.target.value)}>
                <option value="">Choisir une plateforme</option>
                {platformCatalog.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
              </select>
              <button type="button" disabled={!newGameId || !newPlatformId} onClick={addGame}><Icon name="plus" size={16} /> Ajouter</button>
            </div>
            {gameDrafts.length ? <div className="prc-game-edit-list">{gameDrafts.map((game, index) => (
              <article key={`${game.game_id}-${game.platform_id ?? "none"}`} className={game.draftPrimary ? "primary" : ""}>
                <header><span>{game.gameName.slice(0,2).toUpperCase()}</span><div><strong>{game.gameName}</strong><small>{game.platformName ?? "Plateforme inconnue"}</small></div>
                  <div className="prc-game-head-actions"><button type="button" className={game.draftPrimary ? "active" : ""} onClick={() => updateGame(index, { draftPrimary: true })}>{game.draftPrimary ? "★ Jeu principal" : "Définir principal"}</button>
                    <button type="button" className="remove" onClick={() => removeGame(index)}>Retirer</button></div></header>
                <div className="prc-form-grid three">
                  <Field label="Rang"><input value={game.draftRank} onChange={(event) => updateGame(index, { draftRank: event.target.value })} placeholder="Ex. Diamant 2" /></Field>
                  <Field label="Rôle"><input value={game.draftRole} onChange={(event) => updateGame(index, { draftRole: event.target.value })} placeholder="Ex. Support" /></Field>
                  <Field label="Mode favori"><input value={game.draftMode} onChange={(event) => updateGame(index, { draftMode: event.target.value })} placeholder="Ex. Classé" /></Field>
                </div>
                <div className="prc-inline-toggles">
                  <MiniToggle label="J'utilise un micro" checked={game.draftMic} onChange={(value) => updateGame(index, { draftMic: value })} />
                  <MiniToggle label="J'accepte le crossplay" checked={game.draftCrossplay} onChange={(value) => updateGame(index, { draftCrossplay: value })} />
                </div>
              </article>
            ))}</div> : <div className="prc-editor-empty"><span><Icon name="plus" /></span><h3>Aucun jeu configuré</h3><p>Ajoute d'abord un jeu depuis le portail GameMate, puis reviens préciser ton rang et ton rôle ici.</p></div>}
            {gameDrafts.length > 0 && <EditorSave saving={saving} onSave={onSaveGames} />}
          </section>
        )}

        {section === "preferences" && (
          <section className="prc-editor">
            <EditorHeader step="03" title="Ton style de jeu" description="Décris l'ambiance que tu apprécies. GameMate n'affiche pas un faux score : ces informations servent de vrais signaux." />
            <div className="prc-choice-head"><div><span className="prc-eyebrow">GAMING DNA</span><h3>Comment tu joues</h3></div><b>{selectedDnaIds.length} / 8</b></div>
            <div className="prc-chip-grid">{dnaOptions.map((tag) => <button type="button" key={tag.id} className={selectedDnaIds.includes(tag.id) ? "active" : ""} onClick={() => toggleDna(tag.id)}>
              <span><Icon name={selectedDnaIds.includes(tag.id) ? "check" : "plus"} size={14} /></span><strong>{tag.name}</strong><small>{tag.category}</small></button>)}</div>
            <div className="prc-choice-head spaced"><div><span className="prc-eyebrow">INTENTIONS</span><h3>Ce que tu recherches</h3></div><b>{selectedLookingIds.length}</b></div>
            <div className="prc-looking-grid">{lookingOptions.map((option) => <button type="button" key={option.id} className={selectedLookingIds.includes(option.id) ? "active" : ""} onClick={() => toggleLooking(option.id)}>
              <span><Icon name={selectedLookingIds.includes(option.id) ? "check" : "target"} size={14} /></span>{option.label}</button>)}</div>
            <EditorSave saving={saving} onSave={onSavePreferences} />
          </section>
        )}

        {section === "availability" && (
          <section className="prc-editor">
            <EditorHeader step="04" title="Tes disponibilités" description="Indique quand tu joues généralement. Tu pourras ajouter plusieurs créneaux par jour dans une future version." />
            <div className="prc-day-picker">{days.map((day, index) => <button type="button" key={day} className={availabilityDraft.days.includes(index) ? "active" : ""} onClick={() => toggleDay(index)}><span>{day.slice(0,1)}</span><strong>{day}</strong></button>)}</div>
            <div className="prc-form-grid three availability">
              <Field label="Début"><input type="time" value={availabilityDraft.start} onChange={(event) => onAvailabilityDraftChange({ ...availabilityDraft, start: event.target.value })} /></Field>
              <Field label="Fin"><input type="time" value={availabilityDraft.end} onChange={(event) => onAvailabilityDraftChange({ ...availabilityDraft, end: event.target.value })} /></Field>
              <Field label="Fuseau horaire"><input value={availabilityDraft.timezone} onChange={(event) => onAvailabilityDraftChange({ ...availabilityDraft, timezone: event.target.value })} /></Field>
            </div>
            <div className="prc-availability-preview"><span><Icon name="clock" /></span><div><small>APERÇU</small><strong>{availabilityDraft.days.length ? availabilityDraft.days.map((day) => days[day]).join(" · ") : "Aucun jour"}</strong>
              <p>{availabilityDraft.start} – {availabilityDraft.end} · {availabilityDraft.timezone}</p></div></div>
            <EditorSave saving={saving} onSave={onSaveAvailability} />
          </section>
        )}
      </main>
    </div>
  );
}

function EditorHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return <header className="prc-editor-head"><span>{step}</span><div><small>PARAMÉTRAGE DU PROFIL</small><h2>{title}</h2><p>{description}</p></div></header>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="prc-field"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>{children}</label>;
}

function MiniToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={`prc-mini-toggle ${checked ? "active" : ""}`} onClick={() => onChange(!checked)}><span>{label}</span><i><b /></i></button>;
}

function EditorSave({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return <footer className="prc-editor-save"><span>Les modifications sont synchronisées avec ton compte GameMate.</span><button type="button" disabled={saving} onClick={onSave}>{saving ? "Enregistrement..." : "Enregistrer les modifications"}</button></footer>;
}
