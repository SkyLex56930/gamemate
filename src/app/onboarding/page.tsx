import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
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

  if ((profile?.onboarding_step ?? 1) >= 2) {
    redirect("/onboarding/games");
  }

  return (
    <OnboardingForm
      initialProfile={{
        username: profile?.username ?? "",
        displayName: profile?.display_name ?? "",
        bio: profile?.bio ?? "",
        region: profile?.region ?? "",
        dateOfBirth: profile?.date_of_birth ?? "",
      }}
    />
  );
}