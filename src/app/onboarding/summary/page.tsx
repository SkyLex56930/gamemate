import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SummaryForm from "./summary-form";

export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "username, display_name, bio, region, date_of_birth, is_onboarding_complete, onboarding_step"
    )
    .eq("id", user.id)
    .single();

  if (profile?.is_onboarding_complete) {
    redirect("/dashboard");
  }

  if ((profile?.onboarding_step ?? 1) < 6) {
    redirect("/onboarding/looking-for");
  }

  const { data: userGames } = await supabase
    .from("user_games")
    .select(`
      game_id,
      platform_id,
      is_primary,
      rank_text,
      role_text,
      mode_text,
      mic_enabled,
      crossplay_enabled,
      games (
        name
      ),
      platforms (
        name
      )
    `)
    .eq("user_id", user.id);

  const { data: dnaRows } = await supabase
    .from("user_gaming_dna")
    .select(`
      tag_id,
      gaming_dna_tags (
        label
      )
    `)
    .eq("user_id", user.id);

  const { data: availability } = await supabase
    .from("user_availability")
    .select("day_of_week, start_time, end_time, timezone")
    .eq("user_id", user.id)
    .order("day_of_week");

  const { data: lookingForRows } = await supabase
    .from("user_looking_for")
    .select(`
      option_id,
      looking_for_options (
        label
      )
    `)
    .eq("user_id", user.id);

  return (
    <SummaryForm
      profile={{
        username: profile?.username ?? "",
        displayName: profile?.display_name ?? "",
        bio: profile?.bio ?? "",
        region: profile?.region ?? "",
        dateOfBirth: profile?.date_of_birth ?? "",
      }}
      games={userGames ?? []}
      dna={dnaRows ?? []}
      availability={availability ?? []}
      lookingFor={lookingForRows ?? []}
    />
  );
}