import { supabase } from "./supabase";

export type MyProfile = {
  id: string;
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

type UserGame = {
  game_id: string;
  is_primary: boolean;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
};

export type ProfileSummary = {
  profile: MyProfile;
  games: string[];
  gameCount: number;
  completion: number | null;
};

export async function getMyProfileSummary(userId: string): Promise<ProfileSummary> {
  const { data, error } = await supabase.from("profiles")
    .select("id,username,display_name,avatar_url,banner_url,equipped_frame_id,equipped_banner_cosmetic_id,bio,region,language")
    .eq("id", userId).single();
  if (error || !data) throw error ?? new Error("Profil introuvable");
  const profile = data as MyProfile;

  const [gamesResult, dnaResult, availabilityResult, lookingForResult] = await Promise.all([
    supabase.from("user_games").select("game_id,is_primary,rank_text,role_text,mode_text").eq("user_id", userId),
    supabase.from("user_gaming_dna").select("tag_id").eq("user_id", userId),
    supabase.from("user_availability").select("day_of_week").eq("user_id", userId),
    supabase.from("user_looking_for").select("option_id").eq("user_id", userId),
  ]);
  const userGames = (gamesResult.data ?? []) as UserGame[];
  const gameIds = [...new Set(userGames.map((game) => game.game_id))];
  let games: string[] = [];
  if (gameIds.length) {
    const { data: catalog, error: catalogError } = await supabase.from("games")
      .select("id,name").in("id", gameIds);
    if (catalogError) console.error("Accueil / catalogue jeux:", catalogError);
    else {
      const names = new Map((catalog ?? []).map((game) => [game.id, game.name as string]));
      games = [...userGames]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((game) => names.get(game.game_id))
        .filter((name): name is string => Boolean(name));
    }
  }

  // Same weighted fields as the Companion's profile completion indicator.
  const completion = [gamesResult, dnaResult, availabilityResult, lookingForResult]
    .some((result) => result.error) ? null : calculateCompletion(
      profile, userGames,
      dnaResult.data?.length ?? 0,
      availabilityResult.data?.length ?? 0,
      lookingForResult.data?.length ?? 0,
    );

  return { profile, games, gameCount: userGames.length, completion };
}

function calculateCompletion(
  profile: MyProfile, games: UserGame[], dnaCount: number,
  availabilityCount: number, lookingForCount: number,
): number {
  const primary = games.find((game) => game.is_primary) ?? games[0];
  return [
    profile.username?.trim() && profile.display_name?.trim() ? 10 : 0,
    profile.avatar_url ? 10 : 0,
    profile.banner_url ? 5 : 0,
    profile.bio && profile.bio.trim().length >= 20 ? 10 : 0,
    profile.region?.trim() && profile.language?.trim() ? 10 : 0,
    games.length ? 15 : 0,
    primary && (primary.rank_text || primary.role_text || primary.mode_text) ? 10 : 0,
    dnaCount >= 3 ? 10 : 0,
    lookingForCount ? 5 : 0,
    availabilityCount ? 10 : 0,
  ].reduce((sum, points) => sum + points, 0);
}
