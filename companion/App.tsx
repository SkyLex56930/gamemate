import FindMatesScreen from "./pages/FindMatesPage";
import { FormEvent, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { supabase } from "./lib/supabase";
import PlayNowScreen from "./pages/PlayNowPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import ProfilePage from "./pages/ProfilePage";
import SquadsPage from "./pages/SquadsPage";
import FriendsPage from "./pages/FriendsPage";
import MessagesPage from "./pages/MessagesPage";
import TestModePage from "./pages/TestModePage";
import NotificationCenter from "./components/NotificationCenter";

import "./App.css";

type Section = "home" | "play" | "mates" | "squads" | "friends" | "messages" | "profile" | "settings" | "test";
type UiScale = "compact" | "normal" | "large" | "xlarge";
type SettingsTab = "general" | "interface" | "performance" | "notifications" | "account" | "privacy" | "advanced";
type PerfPreset = "eco" | "balanced" | "high" | "ultra" | "custom";

type Profile = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
};

type Game = { id: string; name: string };
type Platform = { id: string; name: string };

type UserGameRow = {
  game_id: string;
  platform_id: string | null;
  is_primary: boolean;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean;
  crossplay_enabled: boolean;
};

type UserGame = UserGameRow & {
  gameName: string;
  platformName: string | null;
};

type GamingDnaTag = { id: string; name: string; category: string };
type AvailabilityRow = { day_of_week: number; start_time: string; end_time: string; timezone: string };
type LookingForOption = { id: string; label: string; slug: string };

type PerformanceSettings = {
  preset: PerfPreset;
  glow: number;
  blur: number;
  particles: number;
  motion: number;
  reduceWhenInactive: boolean;
};

const appWindow = getCurrentWindow();
const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const DEFAULT_PERFORMANCE: PerformanceSettings = {
  preset: "high",
  glow: 82,
  blur: 72,
  particles: 68,
  motion: 80,
  reduceWhenInactive: true,
};

function readUiScale(): UiScale {
  const saved = localStorage.getItem("gamemate-ui-scale");
  return saved === "compact" || saved === "normal" || saved === "large" || saved === "xlarge" ? saved : "large";
}

function readPerformanceSettings(): PerformanceSettings {
  try {
    const raw = localStorage.getItem("gamemate-performance-settings");
    if (!raw) return DEFAULT_PERFORMANCE;
    const parsed = JSON.parse(raw) as Partial<PerformanceSettings>;
    return { ...DEFAULT_PERFORMANCE, ...parsed };
  } catch {
    return DEFAULT_PERFORMANCE;
  }
}

function App() {
  const [section, setSection] = useState<Section>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [gamingDna, setGamingDna] = useState<GamingDnaTag[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [lookingFor, setLookingFor] = useState<LookingForOption[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageTargetUserId, setMessageTargetUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [uiScale, setUiScale] = useState<UiScale>(readUiScale);
  const [navOpen, setNavOpen] = useState(false);
  const [performance, setPerformance] = useState<PerformanceSettings>(readPerformanceSettings);
  const [windowActive, setWindowActive] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(currentSession);
      if (currentSession?.user) await loadAllUserData(currentSession.user.id);
      if (mounted) setAuthLoading(false);
    }

    void initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) void loadAllUserData(currentSession.user.id);
      else clearUserData();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("gamemate-ui-scale", uiScale);
  }, [uiScale]);

  useEffect(() => {
    localStorage.setItem("gamemate-performance-settings", JSON.stringify(performance));
  }, [performance]);

  useEffect(() => {
    const markActive = () => setWindowActive(true);
    const markInactive = () => setWindowActive(false);
    window.addEventListener("focus", markActive);
    window.addEventListener("blur", markInactive);
    return () => {
      window.removeEventListener("focus", markActive);
      window.removeEventListener("blur", markInactive);
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshData = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadAllUserData(userId), 250);
    };

    const channel = supabase
      .channel(`gamemate-user-sync-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, refreshData)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_games", filter: `user_id=eq.${userId}` }, refreshData)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_gaming_dna", filter: `user_id=eq.${userId}` }, refreshData)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_availability", filter: `user_id=eq.${userId}` }, refreshData)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_looking_for", filter: `user_id=eq.${userId}` }, refreshData)
      .subscribe();

    const refreshOnFocus = () => void loadAllUserData(userId);
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void loadAllUserData(userId);
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  function clearUserData() {
    setProfile(null);
    setUserGames([]);
    setGamingDna([]);
    setAvailability([]);
    setLookingFor([]);
  }

  async function loadAllUserData(userId: string) {
    setProfileLoading(true);
    try {
      await Promise.all([
        loadProfile(userId),
        loadGames(userId),
        loadGamingDna(userId),
        loadAvailability(userId),
        loadLookingFor(userId),
      ]);
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url, bio, region, language")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Erreur profil :", error);
      return;
    }
    setProfile(data);
  }

  async function loadGames(userId: string) {
    const { data: userGameRows, error: userGamesError } = await supabase
      .from("user_games")
      .select("game_id, platform_id, is_primary, rank_text, role_text, mode_text, mic_enabled, crossplay_enabled")
      .eq("user_id", userId);

    if (userGamesError) {
      console.error("Erreur user_games :", userGamesError);
      return;
    }

    const rows = userGameRows ?? [];
    const gameIds = [...new Set(rows.map((row) => row.game_id))];
    const platformIds = [...new Set(rows.map((row) => row.platform_id).filter(Boolean))] as string[];
    let games: Game[] = [];
    let platforms: Platform[] = [];

    if (gameIds.length > 0) {
      const { data, error } = await supabase.from("games").select("id, name").in("id", gameIds);
      if (error) console.error("Erreur games :", error);
      else games = data ?? [];
    }

    if (platformIds.length > 0) {
      const { data, error } = await supabase.from("platforms").select("id, name").in("id", platformIds);
      if (error) console.error("Erreur platforms :", error);
      else platforms = data ?? [];
    }

    const mapped: UserGame[] = rows.map((row) => {
      const game = games.find((item) => item.id === row.game_id);
      const platform = platforms.find((item) => item.id === row.platform_id);
      return {
        ...row,
        gameName: game?.name ?? "Jeu inconnu",
        platformName: platform?.name ?? null,
      };
    });

    mapped.sort((a, b) => a.is_primary !== b.is_primary ? (a.is_primary ? -1 : 1) : a.gameName.localeCompare(b.gameName));
    setUserGames(mapped);
  }

  async function loadGamingDna(userId: string) {
    const { data: relations, error: relationError } = await supabase
      .from("user_gaming_dna")
      .select("tag_id")
      .eq("user_id", userId);

    if (relationError) {
      console.error("Erreur user_gaming_dna :", relationError);
      return;
    }

    const ids = (relations ?? []).map((row) => row.tag_id);
    if (ids.length === 0) {
      setGamingDna([]);
      return;
    }

    const { data, error } = await supabase
      .from("gaming_dna_tags")
      .select("id, name, category")
      .in("id", ids);

    if (error) {
      console.error("Erreur gaming_dna_tags :", error);
      return;
    }
    setGamingDna(data ?? []);
  }

  async function loadAvailability(userId: string) {
    const { data, error } = await supabase
      .from("user_availability")
      .select("day_of_week, start_time, end_time, timezone")
      .eq("user_id", userId)
      .order("day_of_week", { ascending: true });

    if (error) {
      console.error("Erreur availability :", error);
      return;
    }
    setAvailability(data ?? []);
  }

  async function loadLookingFor(userId: string) {
    const { data: relations, error: relationError } = await supabase
      .from("user_looking_for")
      .select("option_id")
      .eq("user_id", userId);

    if (relationError) {
      console.error("Erreur user_looking_for :", relationError);
      return;
    }

    const ids = (relations ?? []).map((row) => row.option_id);
    if (ids.length === 0) {
      setLookingFor([]);
      return;
    }

    const { data, error } = await supabase
      .from("looking_for_options")
      .select("id, label, slug")
      .in("id", ids);

    if (error) {
      console.error("Erreur looking_for_options :", error);
      return;
    }
    setLookingFor(data ?? []);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error("Erreur connexion :", error);
      setLoginError(error.message);
      setLoginLoading(false);
      return;
    }

    setSession(data.session);
    if (data.user) await loadAllUserData(data.user.id);
    setPassword("");
    setShowLogin(false);
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setPublicProfileUserId(null);
    setSession(null);
    clearUserData();
    setEmail("");
    setPassword("");
    navigateTo("home");
  }

  async function minimizeWindow() { await appWindow.minimize(); }
  async function toggleMaximizeWindow() { await appWindow.toggleMaximize(); }
  async function closeWindow() { await appWindow.close(); }
  async function startDragging() { await appWindow.startDragging(); }


  useEffect(() => {
    if (!session?.user?.id) {
      setPendingFriendRequests(0);
      return;
    }

    const userId = session.user.id;
    let mounted = true;

    async function loadPendingFriendRequests() {
      const { count, error } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", userId)
        .eq("status", "pending");

      if (!mounted) return;

      if (error) {
        console.error("Pending friend requests:", error);
        return;
      }

      setPendingFriendRequests(count ?? 0);
    }

    void loadPendingFriendRequests();

    const channel = supabase
      .channel(`friend-request-badge:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        (payload) => {
          const next = payload.new as
            | { addressee_id?: string; status?: string }
            | null;
          const previous = payload.old as
            | { addressee_id?: string; status?: string }
            | null;

          const concernsUser =
            next?.addressee_id === userId ||
            previous?.addressee_id === userId;

          if (concernsUser) {
            void loadPendingFriendRequests();
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);


  useEffect(() => {
    if (!session?.user?.id) {
      setUnreadMessages(0);
      return;
    }

    const userId = session.user.id;
    let mounted = true;

    async function loadUnreadMessages() {
      const { data: conversations, error: conversationsError } = await supabase
        .from("conversations")
        .select("id")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`);

      if (!mounted) return;

      if (conversationsError) {
        console.error("Unread messages / conversations:", conversationsError);
        return;
      }

      const conversationIds = (conversations ?? []).map((row) => row.id);

      if (conversationIds.length === 0) {
        setUnreadMessages(0);
        return;
      }

      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .neq("sender_id", userId)
        .is("read_at", null);

      if (!mounted) return;

      if (error) {
        console.error("Unread messages:", error);
        return;
      }

      setUnreadMessages(count ?? 0);
    }

    void loadUnreadMessages();

    const channel = supabase
      .channel(`message-badge:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void loadUnreadMessages();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  function navigateTo(nextSection: Section) {
    setPublicProfileUserId(null);
    setSection(nextSection);
    setNavOpen(false);
  }

  const displayName = profile?.display_name || profile?.username || session?.user.email || "Compte GameMate";
  const avatarLetter = displayName.slice(0, 1).toUpperCase();

  const performanceStyle = {
    "--gm-glow": `${performance.glow / 100}`,
    "--gm-blur": `${Math.round(6 + (performance.blur / 100) * 18)}px`,
    "--gm-particles": `${performance.particles / 100}`,
    "--gm-motion": `${performance.motion / 100}`,
    "--gm-aurora-duration": `${Math.max(10, 30 - performance.motion * 0.18)}s`,
    "--gm-particle-duration": `${Math.max(16, 44 - performance.motion * 0.24)}s`,
    "--gm-scan-duration": `${Math.max(4, 10 - performance.motion * 0.055)}s`,
    "--gm-pulse-duration": `${Math.max(1.1, 2.5 - performance.motion * 0.012)}s`,
    "--gm-orbit-duration": `${Math.max(12, 34 - performance.motion * 0.18)}s`,
  } as CSSProperties;

  const shouldThrottleEffects = performance.reduceWhenInactive && !windowActive;

  return (
    <div
      className={`shell ui-scale-${uiScale} perf-${performance.preset} ${shouldThrottleEffects ? "effects-paused" : ""}`}
      style={performanceStyle}
    >
      <div className="app">
        <header
          className="windowbar"
          onMouseDown={(event) => {
            if (event.button === 0) void startDragging();
          }}
          onDoubleClick={() => void toggleMaximizeWindow()}
        >
          <div className="windowbar-brand">
            <img src="/gamemate-logo.png" alt="" />
            <strong>GameMate</strong>
            <span>Companion</span>
          </div>
          <div className="window-drag-space" />
          <div
            className="window-controls"
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => void minimizeWindow()} aria-label="Réduire"><span className="minimize-icon" /></button>
            <button type="button" onClick={() => void toggleMaximizeWindow()} aria-label="Agrandir"><span className="maximize-icon" /></button>
            <button type="button" className="close" onClick={() => void closeWindow()} aria-label="Fermer">×</button>
          </div>
        </header>

        <div className="cyber-atmosphere" aria-hidden="true">
          <div className="aurora aurora-a" />
          <div className="aurora aurora-b" />
          <div className="aurora aurora-c" />
          <div className="cyber-grid" />
          <div className="particle-field" />
        </div>

        <div className="app-body">
          <aside className={`side-nav ${navOpen ? "open" : ""}`}>
            <button className="nav-brand" type="button" onClick={() => navigateTo("home")}>
              <span className="nav-brand-logo"><img src="/gamemate-logo.png" alt="GameMate" /></span>
              <span className="nav-brand-copy"><strong>GameMate</strong><small>COMPANION 2.0</small></span>
            </button>

            <div className="side-nav-label">JOUER</div>
            <nav className="desktop-nav" aria-label="Navigation principale">
              <TopNavButton active={section === "home"} label="Accueil" icon="⌂" onClick={() => navigateTo("home")} />
              <TopNavButton active={section === "play"} label="Play Now" icon="▶" accent onClick={() => navigateTo("play")} />
              <TopNavButton active={section === "mates"} label="Trouver des mates" icon="◎" onClick={() => navigateTo("mates")} />
            </nav>

            <div className="side-nav-separator" />
            <div className="side-nav-label">SOCIAL</div>
            <nav className="desktop-nav" aria-label="Navigation sociale">
              <TopNavButton active={section === "squads"} label="Squads" icon="◇" onClick={() => navigateTo("squads")} />
              <TopNavButton active={section === "friends"} label="Amis" icon="♢" badge={pendingFriendRequests} onClick={() => navigateTo("friends")} />
              <TopNavButton active={section === "messages"} label="Messages" icon="✦" badge={unreadMessages} onClick={() => { setMessageTargetUserId(null); navigateTo("messages"); }} />
            </nav>

            <div className="side-nav-spacer" />

            <div className="side-nav-account">
              <button
                type="button"
                className="account-button"
                onClick={() => session ? navigateTo("profile") : setShowLogin(true)}
                title={session ? "Mon profil" : "Se connecter"}
              >
                <span className="account-avatar">
                  {authLoading ? "…" : profile?.avatar_url ? <img src={profile.avatar_url} alt={displayName} /> : avatarLetter}
                </span>
                <span className="account-copy">
                  <strong>{authLoading ? "Chargement..." : displayName}</strong>
                  <small>{session ? "Compte connecté" : "Se connecter"}</small>
                </span>
              </button>

              <TopNavButton active={section === "profile"} label="Mon profil" icon="◌" onClick={() => navigateTo("profile")} />
              <TopNavButton active={section === "settings"} label="Paramètres" icon="⚙" onClick={() => navigateTo("settings")} />
              <TopNavButton active={section === "test"} label="Mode test" icon="⌁" onClick={() => navigateTo("test")} />
            </div>
          </aside>

          {navOpen && <button type="button" className="side-nav-overlay" aria-label="Fermer le menu" onClick={() => setNavOpen(false)} />}

          <main className="main-stage">
            <NotificationCenter
              session={session}
              totalCount={pendingFriendRequests + unreadMessages}
              onOpenFriends={() => navigateTo("friends")}
              onOpenMessage={(userId) => {
                setMessageTargetUserId(userId);
                navigateTo("messages");
              }}
              onOpenSquads={() => navigateTo("squads")}
            />
            <header className="mobile-appbar">
              <button
                type="button"
                className={`hamburger ${navOpen ? "open" : ""}`}
                aria-label="Ouvrir le menu"
                aria-expanded={navOpen}
                onClick={() => setNavOpen((value) => !value)}
              >
                <span /><span /><span />
              </button>

              <div className="mobile-appbar-brand">
                <img src="/gamemate-logo.png" alt="" />
                <strong>GameMate</strong>
              </div>

              <button type="button" className="mobile-profile-button" onClick={() => session ? navigateTo("profile") : setShowLogin(true)}>
                <span className="account-avatar">
                  {authLoading ? "…" : profile?.avatar_url ? <img src={profile.avatar_url} alt={displayName} /> : avatarLetter}
                </span>
              </button>
            </header>
          <div className="content">
            {publicProfileUserId ? (
              <PublicProfilePage userId={publicProfileUserId} onBack={() => setPublicProfileUserId(null)} />
            ) : (
              <>
                {section === "home" && (
                  <Home
                    session={session}
                    displayName={displayName}
                    userGames={userGames}
                    gamingDna={gamingDna}
                    lookingFor={lookingFor}
                    onLogin={() => setShowLogin(true)}
                    onPlay={() => navigateTo("play")}
                    onFindMates={() => navigateTo("mates")}
                    onSquads={() => navigateTo("squads")}
                    onMessages={() => navigateTo("messages")}
                    onProfile={() => navigateTo("profile")}
                  />
                )}

                {section === "play" && (
                  <PlayNowScreen session={session} userGames={userGames} lookingFor={lookingFor} onLogin={() => setShowLogin(true)} />
                )}

                {section === "mates" && (
                  <FindMatesScreen
                    session={session}
                    userGames={userGames}
                    gamingDna={gamingDna}
                    lookingFor={lookingFor}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                  />
                )}

                {section === "squads" && <SquadsPage session={session} onLogin={() => setShowLogin(true)} />}

                {section === "friends" && (
                  <FriendsPage
                    session={session}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                    onOpenMessages={(userId) => { setMessageTargetUserId(userId); navigateTo("messages"); }}
                  />
                )}

                {section === "messages" && (
                  <MessagesPage
                    session={session}
                    initialUserId={messageTargetUserId}
                    onInitialUserHandled={() => setMessageTargetUserId(null)}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                    onUnreadCountChange={setUnreadMessages}
                  />
                )}

                {section === "test" && (
                  <TestModePage
                    mainSession={session}
                    mainDisplayName={displayName}
                  />
                )}

                {section === "profile" && (
                  <ProfilePage
                    session={session}
                    profile={profile}
                    displayName={displayName}
                    avatarLetter={avatarLetter}
                    userGames={userGames}
                    gamingDna={gamingDna}
                    availability={availability}
                    lookingFor={lookingFor}
                    loading={profileLoading}
                    onLogin={() => setShowLogin(true)}
                  />
                )}

                {section === "settings" && (
                  <SettingsPage
                    session={session}
                    uiScale={uiScale}
                    performance={performance}
                    onScaleChange={setUiScale}
                    onPerformanceChange={setPerformance}
                    onLogin={() => setShowLogin(true)}
                    onLogout={() => void handleLogout()}
                  />
                )}
              </>
            )}
          </div>
          </main>
        </div>

        {showLogin && !session && (
          <LoginModal
            email={email}
            password={password}
            loading={loginLoading}
            error={loginError}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onClose={() => setShowLogin(false)}
            onSubmit={handleLogin}
          />
        )}
      </div>
    </div>
  );
}

function TopNavButton({ active, label, icon, accent = false, badge = 0, onClick }: {
  active: boolean;
  label: string;
  icon: string;
  accent?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`top-nav-item ${active ? "active" : ""} ${accent ? "accent" : ""}`} onClick={onClick}>
      <span className="top-nav-icon">{icon}</span>
      <span>{label}</span>
      {badge > 0 && (
        <span
          className="top-nav-badge"
          aria-label={`${badge} demande${badge > 1 ? "s" : ""} d’ami`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function Home({ session, displayName, userGames, gamingDna, lookingFor, onLogin, onPlay, onFindMates, onSquads, onMessages, onProfile }: {
  session: Session | null;
  displayName: string;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  lookingFor: LookingForOption[];
  onLogin: () => void;
  onPlay: () => void;
  onFindMates: () => void;
  onSquads: () => void;
  onMessages: () => void;
  onProfile: () => void;
}) {
  const firstName = displayName.split(" ")[0] || displayName;
  const primaryGame = userGames.find((game) => game.is_primary) ?? userGames[0] ?? null;

  return (
    <div className="home-v2">
      <section className="hero-v2">
        <div className="hero-scanline" />
        <div className="hero-copy">
          <div className="hero-kicker"><span className="pulse-dot" /> GAMEMATE NETWORK</div>
          <h1>Trouve tes prochains <span>mates.</span></h1>
          <p>
            {session
              ? `${firstName}, lance une recherche instantanée ou choisis précisément avec qui tu veux jouer.`
              : "Connecte ton compte GameMate et retrouve les joueurs qui jouent comme toi."}
          </p>

          <div className="hero-cta-row">
            {session ? (
              <>
                <button type="button" className="mega-cta primary" onClick={onPlay}>
                  <span className="mega-cta-icon">▶</span>
                  <span><strong>Play Now</strong><small>Je veux jouer maintenant</small></span>
                  <b>→</b>
                </button>
                <button type="button" className="mega-cta secondary" onClick={onFindMates}>
                  <span className="mega-cta-icon">◎</span>
                  <span><strong>Trouver des mates</strong><small>Filtres, profils et compatibilité</small></span>
                  <b>→</b>
                </button>
              </>
            ) : (
              <button type="button" className="mega-cta primary" onClick={onLogin}>
                <span className="mega-cta-icon">→</span>
                <span><strong>Se connecter</strong><small>Accéder au Companion</small></span>
                <b>→</b>
              </button>
            )}
          </div>

          <div className="hero-meta-row">
            {primaryGame && (
              <div className="hero-meta-item">
                <span>JEU PRINCIPAL</span>
                <strong>{prettyValue(primaryGame.gameName)}</strong>
                <small>{primaryGame.platformName ?? "Plateforme non renseignée"}</small>
              </div>
            )}
            {gamingDna.length > 0 && (
              <div className="hero-meta-item">
                <span>GAMING DNA</span>
                <strong>{gamingDna.slice(0, 3).map((tag) => prettyValue(tag.name)).join(" · ")}</strong>
                <small>{gamingDna.length} tag{gamingDna.length > 1 ? "s" : ""} configuré{gamingDna.length > 1 ? "s" : ""}</small>
              </div>
            )}
            {lookingFor.length > 0 && (
              <div className="hero-meta-item">
                <span>OBJECTIF</span>
                <strong>{prettyValue(lookingFor[0].label)}</strong>
                <small>{lookingFor.length > 1 ? `+ ${lookingFor.length - 1} autre${lookingFor.length > 2 ? "s" : ""}` : "Préférence principale"}</small>
              </div>
            )}
          </div>
        </div>

        <div className="hero-emblem" aria-hidden="true">
          <div className="emblem-orbit orbit-1" />
          <div className="emblem-orbit orbit-2" />
          <div className="emblem-orbit orbit-3" />
          <div className="emblem-core"><img src="/gamemate-logo.png" alt="" /></div>
          <div className="emblem-label">GM // ONLINE SOCIAL</div>
        </div>
      </section>

      <section className="home-command-grid">
        <article className="command-card games-command">
          <div className="command-head">
            <div><span className="eyebrow">BIBLIOTHÈQUE</span><h2>Tes jeux</h2></div>
            <button type="button" className="text-action" onClick={onProfile}>Voir le profil →</button>
          </div>
          {userGames.length > 0 ? (
            <div className="game-rail">
              {userGames.slice(0, 5).map((game, index) => (
                <button type="button" className="game-chip-v2" key={`${game.game_id}-${game.platform_id}`} onClick={onFindMates}>
                  <span className={`game-index tone-${index % 4}`}>{game.gameName.slice(0, 2).toUpperCase()}</span>
                  <span className="game-chip-copy"><strong>{prettyValue(game.gameName)}</strong><small>{game.platformName ?? "Plateforme inconnue"}</small></span>
                  {game.is_primary && <span className="primary-star">★</span>}
                </button>
              ))}
            </div>
          ) : <div className="empty-inline">Aucun jeu configuré pour le moment.</div>}
        </article>

        <article className="command-card social-command">
          <div className="command-head"><div><span className="eyebrow">SOCIAL</span><h2>Accès rapide</h2></div></div>
          <div className="quick-social-grid">
            <button type="button" className="quick-social violet" onClick={onSquads}><span>◇</span><div><strong>Squads</strong><small>Invitations et groupe</small></div><b>→</b></button>
            <button type="button" className="quick-social cyan" onClick={onMessages}><span>✦</span><div><strong>Messages</strong><small>Conversations GameMate</small></div><b>→</b></button>
          </div>
        </article>
      </section>
    </div>
  );
}

function SettingsPage({ session, uiScale, performance, onScaleChange, onPerformanceChange, onLogin, onLogout }: {
  session: Session | null;
  uiScale: UiScale;
  performance: PerformanceSettings;
  onScaleChange: (value: UiScale) => void;
  onPerformanceChange: (value: PerformanceSettings) => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("interface");

  function patchPerformance(patch: Partial<PerformanceSettings>) {
    onPerformanceChange({ ...performance, ...patch });
  }

  function applyPreset(preset: PerfPreset) {
    const values: Record<PerfPreset, Partial<PerformanceSettings>> = {
      eco: { glow: 20, blur: 15, particles: 0, motion: 25 },
      balanced: { glow: 55, blur: 45, particles: 30, motion: 55 },
      high: { glow: 82, blur: 72, particles: 68, motion: 80 },
      ultra: { glow: 100, blur: 100, particles: 100, motion: 100 },
    };
    onPerformanceChange({ ...performance, preset, ...values[preset] });
  }

  return (
    <div className="settings-v2">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-head"><span className="eyebrow">COMPANION</span><h2>Paramètres</h2></div>
        <SettingsNavItem active={tab === "general"} icon="⌘" label="Général" onClick={() => setTab("general")} />
        <SettingsNavItem active={tab === "interface"} icon="◫" label="Interface" onClick={() => setTab("interface")} />
        <SettingsNavItem active={tab === "performance"} icon="⚡" label="Performance" onClick={() => setTab("performance")} />
        <SettingsNavItem active={tab === "notifications"} icon="◉" label="Notifications" onClick={() => setTab("notifications")} />
        <div className="settings-nav-separator" />
        <SettingsNavItem active={tab === "account"} icon="◌" label="Compte" onClick={() => setTab("account")} />
        <SettingsNavItem active={tab === "privacy"} icon="◇" label="Confidentialité" onClick={() => setTab("privacy")} />
        <SettingsNavItem active={tab === "advanced"} icon="⚙" label="Avancé" onClick={() => setTab("advanced")} />
      </aside>

      <section className="settings-content-v2">
        {tab === "general" && (
          <SettingsPanel eyebrow="GÉNÉRAL" title="Comportement du Companion" description="Les réglages de démarrage et de fonctionnement général arriveront ici au fur et à mesure qu'ils seront réellement branchés.">
            <InfoRow title="Version actuelle" value="Companion Alpha" />
            <InfoRow title="Compte" value={session ? "Connecté" : "Non connecté"} />
          </SettingsPanel>
        )}

        {tab === "interface" && (
          <SettingsPanel eyebrow="INTERFACE" title="Échelle et confort" description="Ajuste la taille générale sans alourdir la page avec de grosses cartes.">
            <SettingRow title="Taille de l’interface" description="Modifie textes, menus, boutons et cartes.">
              <div className="scale-slider-wrap">
                <input
                  aria-label="Taille de l'interface"
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={uiScale === "compact" ? 0 : uiScale === "normal" ? 1 : uiScale === "large" ? 2 : 3}
                  onChange={(event) => onScaleChange((["compact", "normal", "large", "xlarge"] as UiScale[])[Number(event.target.value)])}
                />
                <div className="range-labels"><span>Compact</span><span>Normal</span><span>Grand</span><span>Très grand</span></div>
              </div>
            </SettingRow>
          </SettingsPanel>
        )}

        {tab === "performance" && (
          <SettingsPanel eyebrow="PERFORMANCE" title="Effets et fluidité" description="Réduis ou augmente les effets visuels selon la puissance de ton PC.">
            <SettingRow title="Préréglage" description="Change plusieurs réglages en une fois.">
              <div className="preset-segmented">
                {(["eco", "balanced", "high", "ultra"] as PerfPreset[]).map((preset) => (
                  <button key={preset} type="button" className={performance.preset === preset ? "selected" : ""} onClick={() => applyPreset(preset)}>
                    {preset === "eco" ? "Éco" : preset === "balanced" ? "Équilibré" : preset === "high" ? "Élevé" : "Ultra"}
                  </button>
                ))}
              </div>
            </SettingRow>
            <CompactRange title="Intensité des néons" value={performance.glow} onChange={(glow) => patchPerformance({ glow, preset: "custom" })} />
            <CompactRange title="Flou / glass effect" value={performance.blur} onChange={(blur) => patchPerformance({ blur, preset: "custom" })} />
            <CompactRange title="Particules d’arrière-plan" value={performance.particles} onChange={(particles) => patchPerformance({ particles, preset: "custom" })} />
            <CompactRange title="Intensité des animations" value={performance.motion} onChange={(motion) => patchPerformance({ motion, preset: "custom" })} />
            <SettingRow title="Réduire en arrière-plan" description="Diminue les effets lorsque la fenêtre GameMate n’est pas active.">
              <Toggle checked={performance.reduceWhenInactive} onChange={(reduceWhenInactive) => patchPerformance({ reduceWhenInactive })} />
            </SettingRow>
          </SettingsPanel>
        )}

        {tab === "notifications" && (
          <SettingsPanel eyebrow="NOTIFICATIONS" title="Alertes GameMate" description="Cette section est prête côté interface. Les préférences seront persistées lorsque les notifications réelles seront branchées.">
            <div className="settings-empty-note">Aucune notification réelle n’est encore configurée ici.</div>
          </SettingsPanel>
        )}

        {tab === "account" && (
          <SettingsPanel eyebrow="COMPTE" title="Compte GameMate" description="Session actuellement utilisée par le Companion.">
            <div className="account-settings-box">
              <div><strong>{session ? "Compte connecté" : "Aucun compte connecté"}</strong><span>{session?.user.email ?? "Connecte-toi pour accéder aux fonctions sociales."}</span></div>
              {session ? <button type="button" className="danger-soft" onClick={onLogout}>Se déconnecter</button> : <button type="button" className="primary compact-button" onClick={onLogin}>Se connecter</button>}
            </div>
          </SettingsPanel>
        )}

        {tab === "privacy" && (
          <SettingsPanel eyebrow="CONFIDENTIALITÉ" title="Contrôle de tes données" description="Les contrôles seront ajoutés au fur et à mesure que les règles de visibilité et de blocage seront persistées.">
            <div className="settings-empty-note">Aucune option fictive n’est activée : cette section reste informative pour l’instant.</div>
          </SettingsPanel>
        )}

        {tab === "advanced" && (
          <SettingsPanel eyebrow="AVANCÉ" title="Réglages avancés" description="Options techniques du Companion.">
            <InfoRow title="Synchronisation compte" value="Supabase Realtime + refresh focus" />
            <InfoRow title="Stockage interface" value="LocalStorage" />
          </SettingsPanel>
        )}
      </section>
    </div>
  );
}

function SettingsNavItem({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button type="button" className={`settings-nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span><strong>{label}</strong></button>;
}

function SettingsPanel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <div className="settings-panel-v2">
      <div className="settings-panel-head"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
      <div className="settings-rows">{children}</div>
    </div>
  );
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="setting-row"><div className="setting-row-copy"><strong>{title}</strong><span>{description}</span></div><div className="setting-row-control">{children}</div></div>;
}

function CompactRange({ title, value, onChange }: { title: string; value: number; onChange: (value: number) => void }) {
  return (
    <SettingRow title={title} description={`${value}%`}>
      <div className="compact-range"><input type="range" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} /><strong>{value}%</strong></div>
    </SettingRow>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={`toggle ${checked ? "on" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>;
}

function InfoRow({ title, value }: { title: string; value: string }) {
  return <div className="info-row"><span>{title}</span><strong>{value}</strong></div>;
}

function LockedPage({ title, onLogin }: { title: string; onLogin: () => void }) {
  return (
    <div className="placeholder locked-page">
      <span className="eyebrow">CONNEXION REQUISE</span>
      <h2>{title}</h2>
      <p>Connecte-toi à ton compte GameMate pour continuer.</p>
      <button type="button" className="primary locked-login-button" onClick={onLogin}>Se connecter</button>
    </div>
  );
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return <div className="placeholder"><span className="eyebrow">GAMEMATE COMPANION</span><h2>{title}</h2><p>{description}</p></div>;
}

function LoginModal({ email, password, loading, error, onEmailChange, onPasswordChange, onClose, onSubmit }: {
  email: string;
  password: string;
  loading: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="companion-login-overlay">
      <div className="companion-login-modal">
        <div className="login-circuit" aria-hidden="true" />
        <button type="button" className="companion-login-close" onClick={onClose}>×</button>
        <img src="/gamemate-logo.png" alt="GameMate" className="companion-login-logo" />
        <span className="eyebrow">COMPTE GAMEMATE</span>
        <h2>Entre dans le réseau.</h2>
        <p>Connecte-toi à ton compte GameMate. Ta session restera enregistrée sur le Companion.</p>
        <form className="companion-login-form" onSubmit={onSubmit}>
          <label>Adresse email<input type="email" value={email} required autoComplete="email" onChange={(event) => onEmailChange(event.target.value)} /></label>
          <label>Mot de passe<input type="password" value={password} required autoComplete="current-password" onChange={(event) => onPasswordChange(event.target.value)} /></label>
          {error && <div className="companion-login-error">{error}</div>}
          <button type="submit" className="primary companion-login-submit" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}</button>
        </form>
      </div>
    </div>
  );
}

function shortDay(value: string) {
  const days: Record<string, string> = { Lundi: "Lun", Mardi: "Mar", Mercredi: "Mer", Jeudi: "Jeu", Vendredi: "Ven", Samedi: "Sam", Dimanche: "Dim" };
  return days[value] ?? value;
}

function prettyValue(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const translations: Record<string, string> = {
    fr: "Français", french: "Français", france: "France", pc: "PC", playstation: "PlayStation", ps5: "PlayStation 5", ps4: "PlayStation 4", xbox: "Xbox", switch: "Nintendo Switch",
    competitive: "Compétitif", chill: "Chill", casual: "Casual", ranked: "Classé", vocal: "Vocal", mic: "Micro", duo: "Duo", squad: "Squad", team: "Équipe", friends: "Amis", "play-now": "Play Now",
  };
  if (translations[normalized]) return translations[normalized];
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) { return value.slice(0, 5); }

export default App;
