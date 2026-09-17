import FindMatesScreen from "./pages/FindMatesPage";
import {
  FormEvent,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentWindow } from "@tauri-apps/api/window";


import { supabase } from "./lib/supabase";
import PlayNowScreen from "./pages/PlayNowPage";
import PublicProfilePage from "./pages/PublicProfilePage";

import "./App.css";

type Section =
  | "home"
  | "play"
  | "mates"
  | "squads"
  | "messages"
  | "communities"
  | "profile"
  | "settings";

type UiScale =
  | "compact"
  | "normal"
  | "large"
  | "xlarge";

type Profile = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
};

type Game = {
  id: string;
  name: string;
};

type Platform = {
  id: string;
  name: string;
};

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

type GamingDnaTag = {
  id: string;
  name: string;
  category: string;
};

type AvailabilityRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type LookingForOption = {
  id: string;
  label: string;
  slug: string;
};

const appWindow = getCurrentWindow();

const dayNames = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function App() {
  const [section, setSection] =
    useState<Section>("home");

  const [session, setSession] =
    useState<Session | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [userGames, setUserGames] =
    useState<UserGame[]>([]);

  const [gamingDna, setGamingDna] =
    useState<GamingDnaTag[]>([]);

  const [availability, setAvailability] =
    useState<AvailabilityRow[]>([]);

  const [lookingFor, setLookingFor] =
    useState<LookingForOption[]>([]);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [profileLoading, setProfileLoading] =
    useState(false);

  const [showLogin, setShowLogin] =
    useState(false);

  const [publicProfileUserId, setPublicProfileUserId] =
    useState<string | null>(null);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loginLoading, setLoginLoading] =
    useState(false);

  const [loginError, setLoginError] =
    useState("");

  const [uiScale, setUiScale] =
    useState<UiScale>(() => {
      const saved =
        localStorage.getItem(
          "gamemate-ui-scale"
        );

      if (
        saved === "compact" ||
        saved === "normal" ||
        saved === "large" ||
        saved === "xlarge"
      ) {
        return saved;
      }

      return "large";
    });

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setSession(session);

      if (session?.user) {
        await loadAllUserData(
          session.user.id
        );
      }

      if (mounted) {
        setAuthLoading(false);
      }
    }

    void initializeAuth();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, currentSession) => {
          setSession(currentSession);

          if (currentSession?.user) {
            void loadAllUserData(
              currentSession.user.id
            );
          } else {
            clearUserData();
          }
        }
      );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "gamemate-ui-scale",
      uiScale
    );
  }, [uiScale]);
  useEffect(() => {
  if (!session?.user?.id) return;

  const userId = session.user.id;

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const refreshData = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      loadAllUserData(userId);
    }, 250);
  };

  const channel = supabase
    .channel(`gamemate-user-sync-${userId}`)

    // Profil
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${userId}`,
      },
      refreshData
    )

    // Jeux / plateformes / rang / rôle...
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_games",
        filter: `user_id=eq.${userId}`,
      },
      refreshData
    )

    // Gaming DNA
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_gaming_dna",
        filter: `user_id=eq.${userId}`,
      },
      refreshData
    )

    // Disponibilités
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_availability",
        filter: `user_id=eq.${userId}`,
      },
      refreshData
    )

    // Ce que tu recherches
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_looking_for",
        filter: `user_id=eq.${userId}`,
      },
      refreshData
    )

    .subscribe();

  const refreshOnFocus = () => {
    loadAllUserData(userId);
  };

  const refreshOnVisibility = () => {
    if (document.visibilityState === "visible") {
      loadAllUserData(userId);
    }
  };

  window.addEventListener("focus", refreshOnFocus);
  document.addEventListener("visibilitychange", refreshOnVisibility);

  return () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    window.removeEventListener("focus", refreshOnFocus);
    document.removeEventListener("visibilitychange", refreshOnVisibility);

    supabase.removeChannel(channel);
  };
}, [session?.user?.id]);

  function clearUserData() {
    setProfile(null);
    setUserGames([]);
    setGamingDna([]);
    setAvailability([]);
    setLookingFor([]);
  }

  async function loadAllUserData(
    userId: string
  ) {
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

  async function loadProfile(
    userId: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("profiles")
      .select(
        `
        username,
        display_name,
        avatar_url,
        bio,
        region,
        language
        `
      )
      .eq("id", userId)
      .single();

    if (error) {
      console.error(
        "Erreur profil :",
        error
      );
      return;
    }

    setProfile(data);
  }

  async function loadGames(
    userId: string
  ) {
    const {
      data: userGameRows,
      error: userGamesError,
    } = await supabase
      .from("user_games")
      .select(
        `
        game_id,
        platform_id,
        is_primary,
        rank_text,
        role_text,
        mode_text,
        mic_enabled,
        crossplay_enabled
        `
      )
      .eq("user_id", userId);

    if (userGamesError) {
      console.error(
        "Erreur user_games :",
        userGamesError
      );
      return;
    }

    const rows =
      userGameRows ?? [];

    const gameIds = [
      ...new Set(
        rows.map(
          (row) => row.game_id
        )
      ),
    ];

    const platformIds = [
      ...new Set(
        rows
          .map(
            (row) =>
              row.platform_id
          )
          .filter(Boolean)
      ),
    ] as string[];

    let games: Game[] = [];
    let platforms: Platform[] = [];

    if (gameIds.length > 0) {
      const {
        data,
        error,
      } = await supabase
        .from("games")
        .select("id, name")
        .in("id", gameIds);

      if (error) {
        console.error(
          "Erreur games :",
          error
        );
      } else {
        games = data ?? [];
      }
    }

    if (
      platformIds.length > 0
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("platforms")
        .select("id, name")
        .in(
          "id",
          platformIds
        );

      if (error) {
        console.error(
          "Erreur platforms :",
          error
        );
      } else {
        platforms =
          data ?? [];
      }
    }

    const mapped: UserGame[] =
      rows.map((row) => {
        const game =
          games.find(
            (item) =>
              item.id ===
              row.game_id
          );

        const platform =
          platforms.find(
            (item) =>
              item.id ===
              row.platform_id
          );

        return {
          ...row,
          gameName:
            game?.name ??
            "Jeu inconnu",
          platformName:
            platform?.name ??
            null,
        };
      });

    mapped.sort(
      (a, b) => {
        if (
          a.is_primary !==
          b.is_primary
        ) {
          return a.is_primary
            ? -1
            : 1;
        }

        return a.gameName.localeCompare(
          b.gameName
        );
      }
    );

    setUserGames(mapped);
  }

  async function loadGamingDna(
    userId: string
  ) {
    const {
      data: relations,
      error: relationError,
    } = await supabase
      .from(
        "user_gaming_dna"
      )
      .select("tag_id")
      .eq("user_id", userId);

    if (relationError) {
      console.error(
        "Erreur user_gaming_dna :",
        relationError
      );
      return;
    }

    const ids =
      (relations ?? []).map(
        (row) => row.tag_id
      );

    if (ids.length === 0) {
      setGamingDna([]);
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "gaming_dna_tags"
      )
      .select(
        "id, name, category"
      )
      .in("id", ids);

    if (error) {
      console.error(
        "Erreur gaming_dna_tags :",
        error
      );
      return;
    }

    setGamingDna(
      data ?? []
    );
  }

  async function loadAvailability(
    userId: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "user_availability"
      )
      .select(
        `
        day_of_week,
        start_time,
        end_time,
        timezone
        `
      )
      .eq(
        "user_id",
        userId
      )
      .order(
        "day_of_week",
        {
          ascending: true,
        }
      );

    if (error) {
      console.error(
        "Erreur availability :",
        error
      );
      return;
    }

    setAvailability(
      data ?? []
    );
  }

  async function loadLookingFor(
    userId: string
  ) {
    const {
      data: relations,
      error: relationError,
    } = await supabase
      .from(
        "user_looking_for"
      )
      .select("option_id")
      .eq(
        "user_id",
        userId
      );

    if (relationError) {
      console.error(
        "Erreur user_looking_for :",
        relationError
      );
      return;
    }

    const ids =
      (relations ?? []).map(
        (row) =>
          row.option_id
      );

    if (ids.length === 0) {
      setLookingFor([]);
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "looking_for_options"
      )
      .select(
        "id, label, slug"
      )
      .in("id", ids);

    if (error) {
      console.error(
        "Erreur looking_for_options :",
        error
      );
      return;
    }

    setLookingFor(
      data ?? []
    );
  }

  async function handleLogin(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoginError("");
    setLoginLoading(true);

    const {
      data,
      error,
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            email.trim(),
          password,
        });

    if (error) {
      console.error(
        "Erreur connexion :",
        error
      );

      setLoginError(
        error.message
      );

      setLoginLoading(false);
      return;
    }

    setSession(
      data.session
    );

    if (data.user) {
      await loadAllUserData(
        data.user.id
      );
    }

    setPassword("");
    setShowLogin(false);
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth
      .signOut();

    setPublicProfileUserId(null);

    setSession(null);

    clearUserData();

    setEmail("");
    setPassword("");

    navigateTo("home");
  }

  async function minimizeWindow() {
    await appWindow.minimize();
  }

  async function toggleMaximizeWindow() {
    await appWindow
      .toggleMaximize();
  }

  async function closeWindow() {
    await appWindow.close();
  }

  async function startDragging() {
    await appWindow
      .startDragging();
  }

  function navigateTo(nextSection: Section) {
    setPublicProfileUserId(null);
    setSection(nextSection);
  }

  const displayName =
    profile?.display_name ||
    profile?.username ||
    session?.user.email ||
    "Compte GameMate";

  const avatarLetter =
    displayName
      .slice(0, 1)
      .toUpperCase();

  const titleMap:
    Record<
      Section,
      string
    > = {
    home: "Accueil",
    play: "Play Now",
    mates:
      "Trouver des mates",
    squads: "Squads",
    messages: "Messages",
    communities:
      "Communautés",
    profile: "Profil",
    settings: "Paramètres",
  };

  return (
    <div
      className={`shell ui-scale-${uiScale}`}
    >
      <div className="app">
        <div
          className="titlebar"
          onMouseDown={(
            event
          ) => {
            if (
              event.button === 0
            ) {
              void startDragging();
            }
          }}
          onDoubleClick={() => {
            void toggleMaximizeWindow();
          }}
        >
          <div className="titlebar-brand">
            <img
              src="/gamemate-logo.png"
              alt=""
            />

            <strong>
              GameMate
            </strong>

            <span>
              Companion
            </span>
          </div>

          <div
            className="window-controls"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
            onDoubleClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              onClick={() =>
                void minimizeWindow()
              }
              aria-label="Réduire"
            >
              <span className="minimize-icon" />
            </button>

            <button
              type="button"
              onClick={() =>
                void toggleMaximizeWindow()
              }
              aria-label="Agrandir"
            >
              <span className="maximize-icon" />
            </button>

            <button
              type="button"
              className="close"
              onClick={() =>
                void closeWindow()
              }
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>

        <div className="body">
          <aside className="sidebar">
            <div className="sidebar-head">
              <img
                src="/gamemate-logo.png"
                alt="GameMate"
              />

              <div>
                <strong>
                  GameMate
                </strong>

                <span>
                  Gaming Social Hub
                </span>
              </div>
            </div>

            <nav>
              <NavButton
                active={
                  section ===
                  "home"
                }
                label="Accueil"
                icon="⌂"
                onClick={() =>
                  navigateTo("home")
                }
              />

              <NavButton
                active={
                  section ===
                  "play"
                }
                label="Play Now"
                icon="▶"
                onClick={() =>
                  navigateTo("play")
                }
              />

              <NavButton
                active={
                  section ===
                  "mates"
                }
                label="Trouver des mates"
                icon="◎"
                onClick={() =>
                  navigateTo("mates")
                }
              />

              <NavButton
                active={
                  section ===
                  "squads"
                }
                label="Squads"
                icon="◇"
                onClick={() =>
                  navigateTo("squads")
                }
              />

              <NavButton
                active={
                  section ===
                  "messages"
                }
                label="Messages"
                icon="✉"
                onClick={() =>
                  navigateTo("messages")
                }
              />

              <NavButton
                active={
                  section ===
                  "communities"
                }
                label="Communautés"
                icon="◉"
                onClick={() =>
                  navigateTo("communities")
                }
              />

              <div className="nav-separator" />

              <NavButton
                active={
                  section ===
                  "profile"
                }
                label="Profil"
                icon="◌"
                onClick={() =>
                  navigateTo("profile")
                }
              />

              <NavButton
                active={
                  section ===
                  "settings"
                }
                label="Paramètres"
                icon="⚙"
                onClick={() =>
                  navigateTo("settings")
                }
              />
            </nav>

            <div className="sidebar-bottom">
              <div className="online-card">
                <span
                  className={
                    session
                      ? "online-dot"
                      : "offline-dot"
                  }
                />

                <div>
                  <strong>
                    {session
                      ? "En ligne"
                      : "Hors ligne"}
                  </strong>

                  <span>
                    {session
                      ? "Prêt à jouer"
                      : "Connecte-toi"}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          <main className="main">
            <header className="topbar">
              <div>
                <span className="eyebrow">
                  GAMEMATE
                </span>

                <h1>
                  {publicProfileUserId
                    ? "Profil joueur"
                    : titleMap[section]}
                </h1>
              </div>

              <div className="topbar-right">
                <button
                  type="button"
                  className="icon-button"
                >
                  ⌕
                </button>

                <button
                  type="button"
                  className="icon-button"
                >
                  ♢
                </button>

                <button
                  type="button"
                  className="user-chip user-chip-button"
                  onClick={() => {
                    if (session) {
                      navigateTo("profile");
                    } else {
                      setShowLogin(
                        true
                      );
                    }
                  }}
                >
                  <div className="avatar">
                    {authLoading ? (
                      "…"
                    ) : profile?.avatar_url ? (
                      <img
                        src={
                          profile.avatar_url
                        }
                        alt={
                          displayName
                        }
                      />
                    ) : (
                      avatarLetter
                    )}
                  </div>

                  <div>
                    <strong>
                      {authLoading
                        ? "Chargement..."
                        : displayName}
                    </strong>

                    <span>
                      {authLoading
                        ? "Vérification..."
                        : session
                          ? "● Connecté"
                          : "Non connecté"}
                    </span>
                  </div>
                </button>
              </div>
            </header>

            <div className="content">
              {publicProfileUserId ? (
                <PublicProfilePage
                  userId={publicProfileUserId}
                  onBack={() => {
                    setPublicProfileUserId(null);
                  }}
                />
              ) : (
                <>
              {section ===
                "home" && (
                <Home
                  session={
                    session
                  }
                  displayName={
                    displayName
                  }
                  userGames={
                    userGames
                  }
                  gamingDna={
                    gamingDna
                  }
                  onLogin={() =>
                    setShowLogin(
                      true
                    )
                  }
                  onPlay={() =>
                    navigateTo("play")
                  }
                  onFindMates={() =>
                    navigateTo("mates")
                  }
                />
              )}

              {section ===
                "play" && (
                <PlayNowScreen
                  session={
                    session
                  }
                  userGames={
                    userGames
                  }
                  lookingFor={
                    lookingFor
                  }
                  onLogin={() =>
                    setShowLogin(
                      true
                    )
                  }
                />
              )}

              {section ===
                "mates" && (
                <FindMatesScreen
                  session={session}
                  userGames={userGames}
                  gamingDna={gamingDna}
                  lookingFor={lookingFor}
                  onLogin={() => setShowLogin(true)}
                  onOpenProfile={(userId) => {
                    setPublicProfileUserId(userId);
                  }}
                />
              )}

              {section ===
                "squads" && (
                <Placeholder
                  title="Squads"
                  description="Création et gestion des squads GameMate."
                />
              )}

              {section ===
                "messages" && (
                <Placeholder
                  title="Messages"
                  description="La messagerie GameMate sera disponible ici."
                />
              )}

              {section ===
                "communities" && (
                <Placeholder
                  title="Communautés"
                  description="Découverte et gestion des communautés."
                />
              )}

              {section ===
                "profile" && (
                <ProfilePage
                  session={
                    session
                  }
                  profile={
                    profile
                  }
                  displayName={
                    displayName
                  }
                  avatarLetter={
                    avatarLetter
                  }
                  userGames={
                    userGames
                  }
                  gamingDna={
                    gamingDna
                  }
                  availability={
                    availability
                  }
                  lookingFor={
                    lookingFor
                  }
                  loading={
                    profileLoading
                  }
                  onLogin={() =>
                    setShowLogin(
                      true
                    )
                  }
                />
              )}

              {section ===
                "settings" && (
                <SettingsPage
                  session={
                    session
                  }
                  uiScale={
                    uiScale
                  }
                  onScaleChange={
                    setUiScale
                  }
                  onLogin={() =>
                    setShowLogin(
                      true
                    )
                  }
                  onLogout={() =>
                    void handleLogout()
                  }
                />
              )}

                </>
              )}
            </div>
          </main>
        </div>

        {showLogin &&
          !session && (
            <LoginModal
              email={email}
              password={
                password
              }
              loading={
                loginLoading
              }
              error={
                loginError
              }
              onEmailChange={
                setEmail
              }
              onPasswordChange={
                setPassword
              }
              onClose={() =>
                setShowLogin(
                  false
                )
              }
              onSubmit={
                handleLogin
              }
            />
          )}
      </div>
    </div>
  );
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${
        active
          ? "active"
          : ""
      }`}
      onClick={onClick}
    >
      <span className="nav-icon">
        {icon}
      </span>

      <span>
        {label}
      </span>
    </button>
  );
}

function Home({
  session,
  displayName,
  userGames,
  gamingDna,
  onLogin,
  onPlay,
  onFindMates,
}: {
  session:
    Session | null;
  displayName: string;
  userGames: UserGame[];
  gamingDna:
    GamingDnaTag[];
  onLogin: () => void;
  onPlay: () => void;
  onFindMates: () => void;
}) {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />

        <div className="hero-copy">
          <span className="hero-badge">
            <i />
            GAME ON
          </span>

          <h2>
            {session
              ? `Salut ${displayName}.`
              : "Trouve tes"}

            <span>
              {session
                ? " Prêt à jouer ?"
                : " prochains mates."}
            </span>
          </h2>

          <p>
            Rejoins des joueurs qui correspondent
            à ton style, ton niveau et tes
            disponibilités.
          </p>

          <div className="hero-actions">
            {session ? (
              <>
                <button
                  type="button"
                  className="primary"
                  onClick={
                    onPlay
                  }
                >
                  ▶ Play Now
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={
                    onFindMates
                  }
                >
                  Trouver des mates
                </button>
              </>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={
                  onLogin
                }
              >
                Se connecter
              </button>
            )}
          </div>
        </div>

        <div className="hero-art">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />

          <img
            src="/gamemate-logo.png"
            alt=""
          />
        </div>
      </section>

      <section className="quick-grid">
        <div className="panel primary-panel">
          <span className="eyebrow">
            TES JEUX
          </span>

          <h3>
            {userGames.length >
            0
              ? `${userGames.length} jeu${
                  userGames.length >
                  1
                    ? "x"
                    : ""
                }`
              : "Aucun jeu"}
          </h3>

          <div className="profile-tag-list">
            {userGames
              .slice(0, 5)
              .map(
                (game) => (
                  <span
                    key={`${game.game_id}-${game.platform_id}`}
                    className="profile-tag"
                  >
                    {
                      game.gameName
                    }
                  </span>
                )
              )}
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">
            GAMING DNA
          </span>

          <h3>
            Ton style
          </h3>

          <div className="profile-tag-list">
            {gamingDna
              .slice(0, 6)
              .map(
                (tag) => (
                  <span
                    key={
                      tag.id
                    }
                    className="profile-tag"
                  >
                    {prettyValue(
                      tag.name
                    )}
                  </span>
                )
              )}
          </div>
        </div>
      </section>
    </div>
  )
}

function ProfilePage({
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
}: {
  session:
    Session | null;
  profile:
    Profile | null;
  displayName: string;
  avatarLetter: string;
  userGames: UserGame[];
  gamingDna:
    GamingDnaTag[];
  availability:
    AvailabilityRow[];
  lookingFor:
    LookingForOption[];
  loading: boolean;
  onLogin: () => void;
}) {
  if (!session) {
    return (
      <LockedPage
        title="Ton profil GameMate"
        onLogin={onLogin}
      />
    );
  }

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-spinner" />

        <span>
          Chargement de ton
          profil GameMate...
        </span>
      </div>
    );
  }

  const primaryGame =
    userGames.find(
      (game) =>
        game.is_primary
    ) ??
    userGames[0];

  return (
    <div className="gm-profile-page">
      <section className="gm-profile-header">
        <div className="gm-profile-header-glow" />

        <div className="gm-profile-avatar-wrap">
          <div className="gm-profile-avatar">
            {profile?.avatar_url ? (
              <img
                src={
                  profile.avatar_url
                }
                alt={
                  displayName
                }
              />
            ) : (
              avatarLetter
            )}
          </div>

          <span className="gm-online-indicator" />
        </div>

        <div className="gm-profile-identity">
          <span className="eyebrow">
            PROFIL GAMEMATE
          </span>

          <h2>
            {displayName}
          </h2>

          <div className="gm-profile-meta">
            {profile?.username && (
              <span>
                @
                {
                  profile.username
                }
              </span>
            )}

            {profile?.region && (
              <span>
                ◉{" "}
                {prettyValue(
                  profile.region
                )}
              </span>
            )}

            {profile?.language && (
              <span>
                ◇{" "}
                {prettyValue(
                  profile.language
                )}
              </span>
            )}
          </div>

          <p className="gm-profile-bio">
            {profile?.bio ||
              "Aucune bio renseignée pour le moment."}
          </p>
        </div>

        <div className="gm-profile-status">
          <div className="gm-status-pill">
            <span className="gm-status-dot" />
            Disponible
          </div>

          {primaryGame && (
            <div className="gm-primary-game-small">
              <span>
                JEU PRINCIPAL
              </span>

              <strong>
                {prettyValue(
                  primaryGame.gameName
                )}
              </strong>
            </div>
          )}
        </div>
      </section>

      <section className="gm-profile-section">
        <div className="gm-section-heading">
          <div>
            <span className="eyebrow">
              BIBLIOTHÈQUE
            </span>

            <h3>
              Mes jeux
            </h3>
          </div>

          <span className="gm-section-count">
            {
              userGames.length
            }
          </span>
        </div>

        {userGames.length ===
        0 ? (
          <div className="gm-empty-card">
            Aucun jeu configuré.
          </div>
        ) : (
          <div className="gm-games-grid">
            {userGames.map(
              (game) => (
                <GameProfileCard
                  key={`${game.game_id}-${game.platform_id}`}
                  game={
                    game
                  }
                />
              )
            )}
          </div>
        )}
      </section>

      <section className="gm-profile-two-columns">
        <ProfilePanel
          eyebrow="PERSONNALITÉ"
          title="Gaming DNA"
        >
          {gamingDna.length >
          0 ? (
            <div className="gm-tags">
              {gamingDna.map(
                (tag) => (
                  <span
                    className={`gm-tag gm-tag-${tag.category}`}
                    key={
                      tag.id
                    }
                  >
                    {prettyValue(
                      tag.name
                    )}
                  </span>
                )
              )}
            </div>
          ) : (
            <p className="profile-empty-text">
              Aucun Gaming DNA
              configuré.
            </p>
          )}
        </ProfilePanel>

        <ProfilePanel
          eyebrow="OBJECTIFS"
          title="Je recherche"
        >
          {lookingFor.length >
          0 ? (
            <div className="gm-tags">
              {lookingFor.map(
                (
                  option
                ) => (
                  <span
                    className="gm-tag gm-tag-cyan"
                    key={
                      option.id
                    }
                  >
                    {prettyValue(
                      option.label
                    )}
                  </span>
                )
              )}
            </div>
          ) : (
            <p className="profile-empty-text">
              Aucune préférence
              configurée.
            </p>
          )}
        </ProfilePanel>
      </section>

      <section className="gm-profile-section">
        <div className="gm-section-heading">
          <div>
            <span className="eyebrow">
              PLANNING
            </span>

            <h3>
              Disponibilités
            </h3>
          </div>

          {availability[0]
            ?.timezone && (
            <span className="gm-timezone">
              {
                availability[0]
                  .timezone
              }
            </span>
          )}
        </div>

        {availability.length >
        0 ? (
          <AvailabilityCard
            availability={
              availability
            }
          />
        ) : (
          <div className="gm-empty-card">
            Aucune disponibilité
            configurée.
          </div>
        )}
      </section>
    </div>
  );
}

function GameProfileCard({
  game,
}: {
  game: UserGame;
}) {
  return (
    <article
      className={`gm-game-card ${
        game.is_primary
          ? "primary-game"
          : ""
      }`}
    >
      <div className="gm-game-card-top">
        <div className="gm-game-icon">
          {game.gameName
            .slice(0, 2)
            .toUpperCase()}
        </div>

        <div className="gm-game-title">
          <div>
            <strong>
              {prettyValue(
                game.gameName
              )}
            </strong>

            {game.is_primary && (
              <span className="gm-primary-badge">
                ★ Principal
              </span>
            )}
          </div>

          <span>
            {prettyValue(
              game.platformName ||
                "Plateforme inconnue"
            )}
          </span>
        </div>
      </div>

      <div className="gm-game-details">
        {game.rank_text && (
          <GameDetail
            label="Rang"
            value={
              game.rank_text
            }
          />
        )}

        {game.role_text && (
          <GameDetail
            label="Rôle"
            value={
              game.role_text
            }
          />
        )}

        {game.mode_text && (
          <GameDetail
            label="Mode"
            value={
              game.mode_text
            }
          />
        )}
      </div>

      <div className="gm-game-features">
        <span
          className={
            game.mic_enabled
              ? "enabled"
              : "disabled"
          }
        >
          ◉ Micro
        </span>

        <span
          className={
            game.crossplay_enabled
              ? "enabled"
              : "disabled"
          }
        >
          ↔ Crossplay
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
  value: string;
}) {
  return (
    <div className="gm-game-detail">
      <span>
        {label}
      </span>

      <strong>
        {prettyValue(
          value
        )}
      </strong>
    </div>
  );
}

function ProfilePanel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="gm-profile-panel">
      <span className="eyebrow">
        {eyebrow}
      </span>

      <h3>
        {title}
      </h3>

      {children}
    </div>
  );
}

function AvailabilityCard({
  availability,
}: {
  availability:
    AvailabilityRow[];
}) {
  const uniqueTimeSlots =
    new Map<
      string,
      string[]
    >();

  availability.forEach(
    (slot) => {
      const timeKey =
        `${formatTime(
          slot.start_time
        )} → ${formatTime(
          slot.end_time
        )}`;

      const current =
        uniqueTimeSlots.get(
          timeKey
        ) ?? [];

      current.push(
        dayNames[
          slot.day_of_week
        ]
      );

      uniqueTimeSlots.set(
        timeKey,
        current
      );
    }
  );

  return (
    <div className="gm-availability">
      {[
        ...uniqueTimeSlots.entries(),
      ].map(
        ([time, days]) => (
          <div
            className="gm-availability-group"
            key={time}
          >
            <div className="gm-day-list">
              {days.map(
                (day) => (
                  <span
                    className="gm-day"
                    key={
                      day
                    }
                  >
                    {shortDay(
                      day
                    )}
                  </span>
                )
              )}
            </div>

            <div className="gm-time">
              <span>
                ◷
              </span>

              <strong>
                {time}
              </strong>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function SettingsPage({
  session,
  uiScale,
  onScaleChange,
  onLogin,
  onLogout,
}: {
  session:
    Session | null;
  uiScale: UiScale;
  onScaleChange:
    (value: UiScale) => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="settings-page">
      <div className="settings-header-card">
        <span className="eyebrow">
          GAMEMATE COMPANION
        </span>

        <h2>
          Paramètres
        </h2>

        <p>
          Personnalise
          l’affichage et le
          comportement du
          Companion.
        </p>
      </div>

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <span className="eyebrow">
              AFFICHAGE
            </span>

            <h3>
              Taille de
              l’interface
            </h3>

            <p>
              Ajuste la taille
              des textes,
              boutons, cartes
              et menus.
            </p>
          </div>
        </div>

        <div className="ui-scale-grid">
          <ScaleOption
            title="Compact"
            description="Plus d’informations à l’écran."
            value="compact"
            current={
              uiScale
            }
            onChange={
              onScaleChange
            }
          />

          <ScaleOption
            title="Normal"
            description="Taille équilibrée."
            value="normal"
            current={
              uiScale
            }
            onChange={
              onScaleChange
            }
          />

          <ScaleOption
            title="Grand"
            description="Plus confortable à lire."
            value="large"
            current={
              uiScale
            }
            onChange={
              onScaleChange
            }
          />

          <ScaleOption
            title="Très grand"
            description="Lisibilité maximale."
            value="xlarge"
            current={
              uiScale
            }
            onChange={
              onScaleChange
            }
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <div>
            <span className="eyebrow">
              COMPTE
            </span>

            <h3>
              Compte GameMate
            </h3>
          </div>
        </div>

        {session ? (
          <div className="settings-account-card">
            <div>
              <strong>
                Connecté
              </strong>

              <span>
                {
                  session.user
                    .email
                }
              </span>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={
                onLogout
              }
            >
              Se déconnecter
            </button>
          </div>
        ) : (
          <div className="settings-account-card">
            <div>
              <strong>
                Non connecté
              </strong>

              <span>
                Connecte ton
                compte
                GameMate.
              </span>
            </div>

            <button
              type="button"
              className="primary"
              onClick={
                onLogin
              }
            >
              Se connecter
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ScaleOption({
  title,
  description,
  value,
  current,
  onChange,
}: {
  title: string;
  description: string;
  value: UiScale;
  current: UiScale;
  onChange:
    (value: UiScale) => void;
}) {
  const selected =
    current === value;

  return (
    <button
      type="button"
      className={`ui-scale-option ${
        selected
          ? "selected"
          : ""
      }`}
      onClick={() =>
        onChange(value)
      }
    >
      <span className="ui-scale-preview">
        Aa
      </span>

      <div>
        <strong>
          {title}
        </strong>

        <span>
          {description}
        </span>
      </div>

      <span className="ui-scale-check">
        {selected
          ? "✓"
          : ""}
      </span>
    </button>
  );
}

function LockedPage({
  title,
  onLogin,
}: {
  title: string;
  onLogin: () => void;
}) {
  return (
    <div className="placeholder">
      <span className="eyebrow">
        CONNEXION REQUISE
      </span>

      <h2>
        {title}
      </h2>

      <p>
        Connecte-toi à ton
        compte GameMate pour
        continuer.
      </p>

      <button
        type="button"
        className="primary locked-login-button"
        onClick={onLogin}
      >
        Se connecter
      </button>
    </div>
  );
}

function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="placeholder">
      <span className="eyebrow">
        GAMEMATE COMPANION
      </span>

      <h2>
        {title}
      </h2>

      <p>
        {description}
      </p>
    </div>
  );
}

function LoginModal({
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
  onEmailChange:
    (value: string) => void;
  onPasswordChange:
    (value: string) => void;
  onClose: () => void;
  onSubmit:
    (
      event:
        FormEvent<HTMLFormElement>
    ) => void;
}) {
  return (
    <div className="companion-login-overlay">
      <div className="companion-login-modal">
        <button
          type="button"
          className="companion-login-close"
          onClick={
            onClose
          }
        >
          ×
        </button>

        <img
          src="/gamemate-logo.png"
          alt="GameMate"
          className="companion-login-logo"
        />

        <span className="eyebrow">
          COMPTE GAMEMATE
        </span>

        <h2>
          Bienvenue
        </h2>

        <p>
          Connecte-toi au
          même compte que sur
          le portail GameMate.
        </p>

        <form
          className="companion-login-form"
          onSubmit={
            onSubmit
          }
        >
          <label>
            Adresse email

            <input
              type="email"
              value={
                email
              }
              required
              autoComplete="email"
              onChange={(
                event
              ) =>
                onEmailChange(
                  event.target
                    .value
                )
              }
            />
          </label>

          <label>
            Mot de passe

            <input
              type="password"
              value={
                password
              }
              required
              autoComplete="current-password"
              onChange={(
                event
              ) =>
                onPasswordChange(
                  event.target
                    .value
                )
              }
            />
          </label>

          {error && (
            <div className="companion-login-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary companion-login-submit"
            disabled={
              loading
            }
          >
            {loading
              ? "Connexion..."
              : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

function shortDay(
  value: string
) {
  const days:
    Record<
      string,
      string
    > = {
    Lundi: "Lun",
    Mardi: "Mar",
    Mercredi: "Mer",
    Jeudi: "Jeu",
    Vendredi: "Ven",
    Samedi: "Sam",
    Dimanche: "Dim",
  };

  return (
    days[value] ??
    value
  );
}

function prettyValue(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "";
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  const translations:
    Record<
      string,
      string
    > = {
    fr: "Français",
    french: "Français",
    france: "France",

    pc: "PC",
    playstation:
      "PlayStation",
    ps5: "PlayStation 5",
    ps4: "PlayStation 4",
    xbox: "Xbox",
    switch:
      "Nintendo Switch",

    competitive:
      "Compétitif",
    chill: "Chill",
    casual: "Casual",
    ranked: "Classé",
    vocal: "Vocal",
    mic: "Micro",

    duo: "Duo",
    squad: "Squad",
    team: "Équipe",
    friends: "Amis",

    "play-now":
      "Play Now",
  };

  if (
    translations[
      normalized
    ]
  ) {
    return translations[
      normalized
    ];
  }

  return value
    .replace(
      /[-_]/g,
      " "
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

function formatTime(
  value: string
) {
  return value.slice(
    0,
    5
  );
}

export default App;