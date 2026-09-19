export type ProfileCompletionInput = {
  profile: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    banner_url?: string | null;
    bio?: string | null;
    region?: string | null;
    language?: string | null;
  } | null;
  userGames: Array<{
    is_primary?: boolean;
    rank_text?: string | null;
    role_text?: string | null;
    mode_text?: string | null;
  }>;
  gamingDna: unknown[];
  availability: unknown[];
  lookingFor: unknown[];
};

export type ProfileCompletionTask = {
  id:
    | "identity"
    | "avatar"
    | "banner"
    | "bio"
    | "location"
    | "games"
    | "gameDetails"
    | "dna"
    | "intentions"
    | "availability";
  label: string;
  description: string;
  points: number;
  done: boolean;
  section: "identity" | "games" | "preferences" | "availability";
};

export function getProfileCompletion(input: ProfileCompletionInput) {
  const { profile, userGames, gamingDna, availability, lookingFor } = input;
  const primaryGame = userGames.find((game) => game.is_primary) ?? userGames[0];

  const tasks: ProfileCompletionTask[] = [
    {
      id: "identity",
      label: "Identité",
      description: "Ajoute ton pseudo et ton nom affiché.",
      points: 10,
      done: Boolean(profile?.username?.trim() && profile?.display_name?.trim()),
      section: "identity",
    },
    {
      id: "avatar",
      label: "Avatar",
      description: "Choisis une image qui permet de te reconnaître.",
      points: 10,
      done: Boolean(profile?.avatar_url),
      section: "identity",
    },
    {
      id: "banner",
      label: "Bannière",
      description: "Personnalise l'en-tête de ton profil.",
      points: 5,
      done: Boolean(profile?.banner_url),
      section: "identity",
    },
    {
      id: "bio",
      label: "Présentation",
      description: "Explique en quelques mots comment tu joues.",
      points: 10,
      done: Boolean(profile?.bio && profile.bio.trim().length >= 20),
      section: "identity",
    },
    {
      id: "location",
      label: "Région et langue",
      description: "Aide GameMate à proposer des joueurs compatibles.",
      points: 10,
      done: Boolean(profile?.region?.trim() && profile?.language?.trim()),
      section: "identity",
    },
    {
      id: "games",
      label: "Jeux et plateformes",
      description: "Ajoute au moins un jeu à ton profil.",
      points: 15,
      done: userGames.length > 0,
      section: "games",
    },
    {
      id: "gameDetails",
      label: "Préférences de jeu",
      description: "Renseigne ton rang, ton rôle ou ton mode principal.",
      points: 10,
      done: Boolean(primaryGame && (primaryGame.rank_text || primaryGame.role_text || primaryGame.mode_text)),
      section: "games",
    },
    {
      id: "dna",
      label: "Gaming DNA",
      description: "Sélectionne au moins trois traits de jeu.",
      points: 10,
      done: gamingDna.length >= 3,
      section: "preferences",
    },
    {
      id: "intentions",
      label: "Ce que tu recherches",
      description: "Indique le type de mates et de sessions souhaités.",
      points: 5,
      done: lookingFor.length > 0,
      section: "preferences",
    },
    {
      id: "availability",
      label: "Disponibilités",
      description: "Ajoute au moins un créneau habituel.",
      points: 10,
      done: availability.length > 0,
      section: "availability",
    },
  ];

  const percent = tasks.reduce((total, task) => total + (task.done ? task.points : 0), 0);
  const completed = tasks.filter((task) => task.done).length;

  return {
    percent,
    completed,
    total: tasks.length,
    tasks,
    nextTask: tasks.find((task) => !task.done) ?? null,
  };
}
