import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GamesSettingsForm from "./games-settings-form";

export const dynamic = "force-dynamic";

export default async function GamesSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_onboarding_complete")
    .eq("id", user.id)
    .single();

  if (!profile?.is_onboarding_complete) {
    redirect("/onboarding");
  }

  const { data: games } = await supabase
    .from("games")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");

  const { data: platforms } = await supabase
    .from("platforms")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");

  const { data: userGames } = await supabase
    .from("user_games")
    .select(`
      id,
      game_id,
      platform_id,
      is_primary,
      rank_text,
      role_text,
      mode_text,
      crossplay_enabled,
      mic_enabled
    `)
    .eq("user_id", user.id);

  return (
    <main className="min-h-screen bg-[#050812] text-white">
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          ← Retour au dashboard
        </Link>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            Profil GameMate
          </p>

          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Mes jeux & plateformes
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Modifie les jeux auxquels tu joues, tes plateformes,
            ton rang, ton rôle et tes préférences de jeu.
          </p>
        </div>

        <div className="mt-8">
          <GamesSettingsForm
            games={games ?? []}
            platforms={platforms ?? []}
            initialSelections={userGames ?? []}
          />
        </div>
      </div>
    </main>
  );
}