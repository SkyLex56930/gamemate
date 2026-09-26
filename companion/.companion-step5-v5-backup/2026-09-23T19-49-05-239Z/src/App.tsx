import FindMatesScreen from "./pages/FindMatesPage";
import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { supabase } from "./lib/supabase";
import { getProfileCompletion } from "./lib/profileCompletion";
import PlayNowScreen from "./pages/PlayNowPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import ProfilePage from "./pages/ProfilePage";
import SquadsPage from "./pages/SquadsPage";
import FriendsPage from "./pages/FriendsPage";
import MessagesPage from "./pages/MessagesPage";
import TestModePage from "./pages/TestModePage";
import SettingsPage, { type AppearanceSettings } from "./pages/SettingsPage";
import SupportPage from "./pages/SupportPage";
import NotificationCenter from "./components/NotificationCenter";

import "./App.css";
import "./CompanionV8.css";

type Section = "home" | "play" | "mates" | "squads" | "friends" | "messages" | "profile" | "support" | "settings" | "test";
type UiScale = "compact" | "normal" | "large" | "xlarge";
type PerfPreset = "eco" | "balanced" | "high" | "ultra" | "custom";
type NavigationMode = "full" | "compact";

type PresenceStatus = "online" | "busy" | "offline";

type ModerationSanctionType = "warning" | "mute" | "suspension" | "ban";

type ModerationSanction = {
  id: number;
  type: ModerationSanctionType;
  reason: string;
  starts_at: string;
  ends_at: string | null;
};

type ModerationState = {
  restricted: boolean;
  muted: boolean;
  top_sanction: ModerationSanction | null;
  active_sanctions: ModerationSanction[];
};

const EMPTY_MODERATION_STATE: ModerationState = {
  restricted: false,
  muted: false,
  top_sanction: null,
  active_sanctions: [],
};

function formatSanctionDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}


function readPresenceStatus(): PresenceStatus {
  const saved = localStorage.getItem("gamemate-presence-status");
  return saved === "busy" || saved === "offline" ? saved : "online";
}

type Profile = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  equipped_frame_id: string | null;
  equipped_banner_cosmetic_id: string | null;
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
const DEFAULT_PERFORMANCE: PerformanceSettings = {
  preset: "high",
  glow: 82,
  blur: 72,
  particles: 68,
  motion: 80,
  reduceWhenInactive: true,
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  accent: "violet",
  density: "comfortable",
  highContrast: false,
  reduceMotion: false,
};

function readUiScale(): UiScale {
  const saved = localStorage.getItem("gamemate-ui-scale");
  return saved === "compact" || saved === "normal" || saved === "large" || saved === "xlarge" ? saved : "large";
}


function readStartupSection(): Section {
  const saved = localStorage.getItem("gamemate-startup-section");
  return saved === "play" || saved === "friends" || saved === "messages" ? saved : "home";
}

function readNavigationMode(): NavigationMode {
  return localStorage.getItem("gamemate-navigation-mode") === "compact" ? "compact" : "full";
}

function readNotificationBadges() {
  return localStorage.getItem("gamemate-notification-badges-enabled") !== "false";
}

function readAppearanceSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem("gamemate-appearance-settings");
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      accent: parsed.accent === "cyan" || parsed.accent === "magenta" || parsed.accent === "emerald" ? parsed.accent : "violet",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      highContrast: Boolean(parsed.highContrast),
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
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
  const [section, setSection] = useState<Section>(readStartupSection);
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
  const [openSupportTickets, setOpenSupportTickets] = useState(0);
  const [messageTargetUserId, setMessageTargetUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [uiScale, setUiScale] = useState<UiScale>(readUiScale);
  const [navOpen, setNavOpen] = useState(false);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(readNavigationMode);
  const [notificationBadges, setNotificationBadges] = useState(readNotificationBadges);
  const [performance, setPerformance] = useState<PerformanceSettings>(readPerformanceSettings);
  const [appearance, setAppearance] = useState<AppearanceSettings>(readAppearanceSettings);
  const [windowActive, setWindowActive] = useState(true);
  const [moderationState, setModerationState] = useState<ModerationState>(EMPTY_MODERATION_STATE);

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
    localStorage.setItem("gamemate-navigation-mode", navigationMode);
  }, [navigationMode]);

  useEffect(() => {
    localStorage.setItem("gamemate-notification-badges-enabled", String(notificationBadges));
  }, [notificationBadges]);

  useEffect(() => {
    localStorage.setItem("gamemate-appearance-settings", JSON.stringify(appearance));
  }, [appearance]);


  useEffect(() => {
    if (!session?.user?.id) return;

    let stopped = false;

    const publishPresence = async () => {
      if (stopped) return;
      const status = readPresenceStatus();
      const { error } = await supabase.rpc("set_my_presence", { p_status: status });
      if (error) console.error("Presence:", error);
    };

    void publishPresence();

    const heartbeat = window.setInterval(() => {
      void publishPresence();
    }, 30000);

    const onPresenceStatusChanged = () => {
      void publishPresence();
    };

    const onBeforeUnload = () => {
      void supabase.rpc("set_my_presence", { p_status: "offline" });
    };

    window.addEventListener("gamemate-presence-status-changed", onPresenceStatusChanged);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("gamemate-presence-status-changed", onPresenceStatusChanged);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void supabase.rpc("set_my_presence", { p_status: "offline" });
    };
  }, [session?.user?.id]);


  useEffect(() => {
    const refresh = () => {
      if (session?.user?.id) void loadAllUserData(session.user.id);
    };
    window.addEventListener("gamemate-profile-updated", refresh);
    return () => window.removeEventListener("gamemate-profile-updated", refresh);
  }, [session?.user?.id]);

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
      .select("username, display_name, avatar_url, banner_url, equipped_frame_id, equipped_banner_cosmetic_id, bio, region, language")
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


  useEffect(() => {
    if (!session?.user?.id) {
      setModerationState(EMPTY_MODERATION_STATE);
      return;
    }

    const userId = session.user.id;
    let mounted = true;

    const loadModerationState = async () => {
      const { data, error } = await supabase.rpc("get_my_moderation_state");

      if (!mounted) return;

      if (error) {
        console.error("Moderation state:", error);
        return;
      }

      setModerationState((data ?? EMPTY_MODERATION_STATE) as ModerationState);
    };

    void loadModerationState();

    const channel = supabase
      .channel(`moderation-state:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "moderation_sanctions",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadModerationState()
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadModerationState();
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadModerationState();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);


  useEffect(() => {
    if (!session?.user?.id) {
      setOpenSupportTickets(0);
      return;
    }

    let mounted = true;

    const loadOpenSupportTickets = async () => {
      const { count, error } = await supabase
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("resolved","closed")');

      if (!mounted) return;
      if (error) {
        console.error("Support badge:", error);
        return;
      }

      setOpenSupportTickets(count ?? 0);
    };

    void loadOpenSupportTickets();

    const channel = supabase
      .channel(`support-ticket-badge:${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => void loadOpenSupportTickets()
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
  const profileCompletion = getProfileCompletion({ profile, userGames, gamingDna, availability, lookingFor });

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

  const blockingSanction = moderationState.active_sanctions.find(
    (sanction) => sanction.type === "ban" || sanction.type === "suspension"
  ) ?? null;

  const muteSanction = moderationState.active_sanctions.find(
    (sanction) => sanction.type === "mute"
  ) ?? null;

  const warningSanction = moderationState.active_sanctions.find(
    (sanction) => sanction.type === "warning"
  ) ?? null;

  const visibleNoticeSanction = muteSanction ?? warningSanction;

  return (
    <div
      className={`gm-shell ui-scale-${uiScale} nav-mode-${navigationMode} accent-${appearance.accent} density-${appearance.density} ${appearance.highContrast ? "contrast-high" : ""} ${appearance.reduceMotion ? "reduced-motion" : ""} ${shouldThrottleEffects ? "is-paused" : ""}`}
      style={performanceStyle}
    >
      <header
        className="gm-windowbar"
        onMouseDown={(event) => {
          if (event.button === 0) void startDragging();
        }}
        onDoubleClick={() => void toggleMaximizeWindow()}
      >
        <div className="gm-windowbar-brand">
          <img src="/gamemate-logo.png" alt="" />
          <strong>GameMate</strong>
          <span>Companion</span>
        </div>
        <div className="gm-windowbar-spacer" />
        <div
          className="gm-window-controls"
          onMouseDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => void minimizeWindow()} aria-label="Réduire">—</button>
          <button type="button" onClick={() => void toggleMaximizeWindow()} aria-label="Agrandir">□</button>
          <button type="button" className="close" onClick={() => void closeWindow()} aria-label="Fermer">×</button>
        </div>
      </header>

      <div className="gm-app">
        <aside className={`gm-sidebar ${navOpen ? "open" : ""}`}>
          <button className="gm-brand" type="button" onClick={() => navigateTo("home")}>
            <img src="/gamemate-logo.png" alt="" />
            <span>
              <strong>GameMate</strong>
              <small>Play. Connect. Improve.</small>
            </span>
          </button>

          <nav className="gm-nav">
            <div className="gm-nav-group">
              <span className="gm-nav-label">PRINCIPAL</span>
              <NavItem active={section === "home"} icon="⌂" label="Accueil" onClick={() => navigateTo("home")} />
              <NavItem active={section === "play"} icon="▶" label="Play Now" onClick={() => navigateTo("play")} />
              <NavItem active={section === "mates"} icon="⌕" label="Trouver des mates" onClick={() => navigateTo("mates")} />
            </div>

            <div className="gm-nav-group">
              <span className="gm-nav-label">SOCIAL</span>
              <NavItem active={section === "squads"} icon="◇" label="Squads" onClick={() => navigateTo("squads")} />
              <NavItem active={section === "friends"} icon="♢" label="Amis" badge={notificationBadges ? pendingFriendRequests : 0} onClick={() => navigateTo("friends")} />
              <NavItem
                active={section === "messages"}
                icon="✦"
                label="Messages"
                badge={notificationBadges ? unreadMessages : 0}
                onClick={() => {
                  setMessageTargetUserId(null);
                  navigateTo("messages");
                }}
              />
            </div>

            <div className="gm-nav-group">
              <span className="gm-nav-label">COMPTE</span>
              <NavItem active={section === "profile"} icon="◌" label="Mon profil" onClick={() => navigateTo("profile")} />
              <NavItem active={section === "support"} icon="?" label="Support" badge={notificationBadges ? openSupportTickets : 0} onClick={() => navigateTo("support")} />
              <NavItem active={section === "settings"} icon="⚙" label="Paramètres" onClick={() => navigateTo("settings")} />
              <NavItem active={section === "test"} icon="⌁" label="Mode test" onClick={() => navigateTo("test")} />
            </div>
          </nav>

          <div className="gm-sidebar-bottom">
            <div className="gm-slogan-card">
              <span>GOOD PLAYERS</span>
              <strong>BETTER MATES</strong>
              <p>Joue, progresse et rencontre les bons joueurs.</p>
            </div>

            <button
              type="button"
              className="gm-account-card"
              onClick={() => session ? navigateTo("profile") : setShowLogin(true)}
            >
              <span className="gm-account-avatar">
                {authLoading ? "…" : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} />
                ) : (
                  avatarLetter
                )}
              </span>
              <span>
                <strong>{authLoading ? "Chargement..." : displayName}</strong>
                <small>{session ? "Compte connecté" : "Se connecter"}</small>
              </span>
            </button>
          </div>
        </aside>

        {navOpen && <button className="gm-mobile-overlay" type="button" onClick={() => setNavOpen(false)} aria-label="Fermer le menu" />}

        <section className="gm-main">
          <header className="gm-topbar">
            <button
              type="button"
              className="gm-mobile-menu"
              onClick={() => setNavOpen((value) => !value)}
              aria-label="Ouvrir le menu"
            >
              ☰
            </button>

            <button type="button" className="gm-search" onClick={() => navigateTo("mates")}>
              <span>⌕</span>
              <span>Trouver des mates...</span>
            </button>

            <div className="gm-top-actions">
              <button type="button" className="gm-icon-btn" onClick={() => navigateTo("friends")} aria-label="Amis">
                ♢
                {notificationBadges && pendingFriendRequests > 0 && <b>{pendingFriendRequests > 99 ? "99+" : pendingFriendRequests}</b>}
              </button>

              <button
                type="button"
                className="gm-icon-btn"
                onClick={() => {
                  setMessageTargetUserId(null);
                  navigateTo("messages");
                }}
                aria-label="Messages"
              >
                ◯
                {notificationBadges && unreadMessages > 0 && <b>{unreadMessages > 99 ? "99+" : unreadMessages}</b>}
              </button>

              <NotificationCenter
                session={session}
                totalCount={notificationBadges ? pendingFriendRequests + unreadMessages : 0}
                onOpenFriends={() => navigateTo("friends")}
                onOpenMessage={(userId) => {
                  setMessageTargetUserId(userId);
                  navigateTo("messages");
                }}
                onOpenSquads={() => navigateTo("squads")}
              />

              <button
                type="button"
                className="gm-top-profile"
                onClick={() => session ? navigateTo("profile") : setShowLogin(true)}
              >
                <span className="gm-top-avatar">
                  {authLoading ? "…" : profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} />
                  ) : (
                    avatarLetter
                  )}
                </span>
                <span>
                  <strong>{displayName}</strong>
                  <small>{session ? "GameMate" : "Connexion"}</small>
                </span>
              </button>

              <button type="button" className="gm-icon-btn" onClick={() => navigateTo("settings")} aria-label="Paramètres">⚙</button>
            </div>
          </header>

          {!moderationState.restricted && visibleNoticeSanction && (
            <div className={`gm-sanction-banner ${visibleNoticeSanction.type}`}>
              <div>
                <strong>
                  {visibleNoticeSanction.type === "mute"
                    ? "Messagerie temporairement désactivée"
                    : "Avertissement de modération"}
                </strong>
                <span>{visibleNoticeSanction.reason}</span>
              </div>

              <div className="gm-sanction-banner-meta">
                {visibleNoticeSanction.ends_at && (
                  <span>
                    Jusqu’au {formatSanctionDate(visibleNoticeSanction.ends_at)}
                  </span>
                )}
                <button type="button" onClick={() => navigateTo("support")}>
                  Support
                </button>
              </div>
            </div>
          )}

          <main className={`gm-content gm-section-${section}`}>
            {publicProfileUserId ? (
              <PublicProfilePage userId={publicProfileUserId} onBack={() => setPublicProfileUserId(null)} />
            ) : (
              <>
                {section === "home" && (
                  <CleanHome
                    session={session}
                    displayName={displayName}
                    profile={profile}
                    userGames={userGames}
                    gamingDna={gamingDna}
                    lookingFor={lookingFor}
                    profileCompletion={profileCompletion.percent}
                    onLogin={() => setShowLogin(true)}
                    onPlay={() => navigateTo("play")}
                    onFindMates={() => navigateTo("mates")}
                    onSquads={() => navigateTo("squads")}
                    onMessages={() => navigateTo("messages")}
                    onProfile={() => navigateTo("profile")}
                  />
                )}

                {section === "play" && (
                  <PlayNowScreen
                    session={session}
                    userGames={userGames}
                    lookingFor={lookingFor}
                    profileCompletion={profileCompletion.percent}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                    onOpenSettings={() => navigateTo("profile")}
                  />
                )}

                {section === "mates" && (
                  <FindMatesScreen
                    session={session}
                    userGames={userGames}
                    gamingDna={gamingDna}
                    lookingFor={lookingFor}
                    profileCompletion={profileCompletion.percent}
                    profileRegion={profile?.region ?? null}
                    profileLanguage={profile?.language ?? null}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                    onOpenMessages={(userId) => {
                      setMessageTargetUserId(userId);
                      navigateTo("messages");
                    }}
                    onOpenFriends={() => navigateTo("friends")}
                    onOpenSquads={() => navigateTo("squads")}
                    onOpenSettings={() => navigateTo("profile")}
                  />
                )}

                {section === "squads" && (
                  <SquadsPage session={session} onLogin={() => setShowLogin(true)} />
                )}

                {section === "friends" && (
                  <FriendsPage
                    session={session}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                    onOpenMessages={(userId) => {
                      setMessageTargetUserId(userId);
                      navigateTo("messages");
                    }}
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

                {section === "support" && (
                  <SupportPage
                    session={session}
                    onLogin={() => setShowLogin(true)}
                  />
                )}

                {section === "settings" && (
                  <SettingsPage
                    session={session}
                    displayName={displayName}
                    uiScale={uiScale}
                    performance={performance}
                    appearance={appearance}
                    navigationMode={navigationMode}
                    notificationBadges={notificationBadges}
                    onScaleChange={setUiScale}
                    onPerformanceChange={setPerformance}
                    onAppearanceChange={setAppearance}
                    onNavigationModeChange={setNavigationMode}
                    onNotificationBadgesChange={setNotificationBadges}
                    onLogin={() => setShowLogin(true)}
                    onLogout={() => void handleLogout()}
                  />
                )}

                {section === "test" && (
                  <TestModePage
                    mainSession={session}
                    mainDisplayName={displayName}
                  />
                )}
              </>
            )}
          </main>
        </section>
      </div>

      {session && moderationState.restricted && blockingSanction && section !== "support" && (
        <div className="gm-sanction-lock">
          <section className={`gm-sanction-lock-card ${blockingSanction.type}`}>
            <div className="gm-sanction-lock-icon">
              {blockingSanction.type === "ban" ? "×" : "!"}
            </div>

            <span className="gm-sanction-lock-kicker">MODÉRATION GAMEMATE</span>

            <h1>
              {blockingSanction.type === "ban"
                ? "Compte banni"
                : "Compte temporairement suspendu"}
            </h1>

            <p className="gm-sanction-lock-reason">
              {blockingSanction.reason}
            </p>

            <div className="gm-sanction-lock-details">
              <div>
                <small>Sanction</small>
                <strong>
                  {blockingSanction.type === "ban"
                    ? "Bannissement"
                    : "Suspension"}
                </strong>
              </div>

              <div>
                <small>Fin prévue</small>
                <strong>
                  {blockingSanction.ends_at
                    ? formatSanctionDate(blockingSanction.ends_at)
                    : "Durée indéterminée"}
                </strong>
              </div>
            </div>

            <p className="gm-sanction-lock-help">
              Le Support reste accessible si tu souhaites demander des explications
              ou signaler une erreur.
            </p>

            <div className="gm-sanction-lock-actions">
              <button
                type="button"
                className="primary"
                onClick={() => navigateTo("support")}
              >
                Contacter le support
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() => void handleLogout()}
              >
                Se déconnecter
              </button>
            </div>
          </section>
        </div>
      )}

      {showLogin && !session && (
        <CleanLoginModal
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
  );
}


function NavItem({
  active,
  icon,
  label,
  badge = 0,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`gm-nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <span className="gm-nav-icon">{icon}</span>
      <span className="gm-nav-text">{label}</span>
      {badge > 0 && <b className="gm-nav-badge">{badge > 99 ? "99+" : badge}</b>}
    </button>
  );
}

function CleanHome({
  session,
  displayName,
  profile,
  userGames,
  gamingDna,
  lookingFor,
  profileCompletion,
  onLogin,
  onPlay,
  onFindMates,
  onSquads,
  onMessages,
  onProfile,
}: {
  session: Session | null;
  displayName: string;
  profile: Profile | null;
  userGames: UserGame[];
  gamingDna: GamingDnaTag[];
  lookingFor: LookingForOption[];
  profileCompletion: number;
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
    <div className="gm-home gm-home-minimal">
      <section className="gm-hero gm-hero-minimal">
        <div className="gm-hero-copy">
          <span className="gm-eyebrow">GAMEMATE</span>
          <h1>{session ? `Salut ${firstName}.` : "Trouve les bons mates."}</h1>
          <p>
            {session
              ? primaryGame
                ? `Prêt pour ${prettyValue(primaryGame.gameName)} ?`
                : "Choisis ce que tu veux faire."
              : "Connecte-toi pour accéder à ton Companion."}
          </p>
          <div className="gm-hero-actions">
            {session ? (
              <>
                <button className="gm-btn primary" type="button" onClick={onPlay}>▶ Jouer maintenant</button>
                <button className="gm-btn" type="button" onClick={onFindMates}>Trouver des mates</button>
              </>
            ) : (
              <button className="gm-btn primary" type="button" onClick={onLogin}>Se connecter</button>
            )}
          </div>
        </div>

        {session && (
          <div className="gm-hero-command">
            <div className="gm-hero-orbit">
              <span>{primaryGame?.gameName.slice(0, 2).toUpperCase() ?? "GM"}</span>
              <i /><b />
            </div>
            <div className="gm-hero-game-copy">
              <small>SESSION CONSEILLÉE</small>
              <strong>{primaryGame?.gameName ?? "Configure ton jeu principal"}</strong>
              <span>{primaryGame?.platformName ?? "Ton Companion est prêt"}</span>
            </div>
            <button type="button" onClick={onPlay}>Lancer Play Now <b>→</b></button>
          </div>
        )}
      </section>

      <section className="gm-minimal-actions">
        <button type="button" onClick={onPlay}>
          <span>▶</span>
          <div><strong>Jouer</strong><small>Play Now</small></div>
        </button>
        <button type="button" onClick={onFindMates}>
          <span>⌕</span>
          <div><strong>Recherche</strong><small>Trouver des mates</small></div>
        </button>
        <button type="button" onClick={onSquads}>
          <span>◇</span>
          <div><strong>Squads</strong><small>Groupe et invitations</small></div>
        </button>
      </section>

      <section className="gm-minimal-content">
        <article className="gm-card gm-minimal-games">
          <div className="gm-card-head">
            <div>
              <span className="gm-eyebrow">MES JEUX</span>
              <h2>Bibliothèque</h2>
            </div>
            <button type="button" onClick={onProfile}>Gérer</button>
          </div>

          {userGames.length > 0 ? (
            <div className="gm-minimal-game-list">
              {userGames.slice(0, 4).map((game, index) => (
                <button type="button" key={`${game.game_id}-${game.platform_id}`} onClick={onFindMates}>
                  <span className={`gm-mini-game-art tone-${index % 4}`}>{game.gameName.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{prettyValue(game.gameName)}</strong>
                    <small>{game.platformName ? prettyValue(game.platformName) : "Plateforme non renseignée"}</small>
                  </div>
                  {game.is_primary && <i>Principal</i>}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState text="Aucun jeu configuré." action={session ? "Ajouter mes jeux" : undefined} onAction={session ? onProfile : undefined} />
          )}
        </article>

        <article className="gm-card gm-minimal-profile">
          <div className="gm-card-head">
            <div>
              <span className="gm-eyebrow">PROFIL</span>
              <h2>{displayName}</h2>
            </div>
            <button type="button" onClick={onProfile}>Ouvrir</button>
          </div>

          <p>
            {profile?.bio ||
              (session
                ? "Complète ton profil pour améliorer tes recherches."
                : "Connecte-toi pour afficher ton profil.")}
          </p>

          {session && (
            <button type="button" className="gm-home-completion" onClick={onProfile}>
              <span className="gm-home-completion-ring" style={{ "--home-progress": `${profileCompletion * 3.6}deg` } as CSSProperties}>
                <strong>{profileCompletion}%</strong>
              </span>
              <span>
                <small>PROFIL GAMEMATE</small>
                <strong>{profileCompletion >= 80 ? "Prêt pour le matching" : "Continue la configuration"}</strong>
                <em>{profileCompletion === 100 ? "Toutes les informations sont renseignées." : "Plus ton profil est précis, plus les résultats sont utiles."}</em>
              </span>
              <b>›</b>
            </button>
          )}

          {gamingDna.length > 0 && (
            <div className="gm-tags">
              {gamingDna.slice(0, 4).map((tag) => <span key={tag.id}>{prettyValue(tag.name)}</span>)}
            </div>
          )}

          {lookingFor.length > 0 && (
            <div className="gm-minimal-looking">
              <small>Tu recherches</small>
              <strong>{prettyValue(lookingFor[0].label)}</strong>
            </div>
          )}

          <button className="gm-btn full" type="button" onClick={onMessages}>Ouvrir les messages</button>
        </article>
      </section>
    </div>
  );
}

function EmptyState({
  text,
  action,
  onAction,
}: {
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="gm-empty">
      <p>{text}</p>
      {action && onAction && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}

function CleanLoginModal({
  email,
  password,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onClose,
  onSubmit,
}: {
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
    <div className="gm-modal-backdrop" onMouseDown={onClose}>
      <form className="gm-login-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <button type="button" className="gm-modal-close" onClick={onClose}>×</button>
        <img src="/gamemate-logo.png" alt="" />
        <span className="gm-eyebrow">GAMEMATE</span>
        <h2>Connexion</h2>
        <p>Connecte-toi à ton compte GameMate.</p>

        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" required />
        </label>

        <label>
          <span>Mot de passe</span>
          <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} autoComplete="current-password" required />
        </label>

        {error && <div className="gm-login-error">{error}</div>}

        <button className="gm-btn primary full" type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

function prettyValue(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default App;
