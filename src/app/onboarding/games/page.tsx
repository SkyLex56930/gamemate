import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GamesForm from "./games-form";

export const dynamic = "force-dynamic";

export default async function GamesOnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_onboarding_complete, onboarding_step")
    .eq("id", user.id)
    .single();

  if (profile?.is_onboarding_complete) {
    redirect("/dashboard");
  }

  if ((profile?.onboarding_step ?? 1) < 2) {
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

  return (
    <GamesForm
      games={games ?? []}
      platforms={platforms ?? []}
    />
  );
}