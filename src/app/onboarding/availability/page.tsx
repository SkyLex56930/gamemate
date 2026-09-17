import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AvailabilityForm from "./availability-form";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
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

  if ((profile?.onboarding_step ?? 1) < 4) {
    redirect("/onboarding/gaming-dna");
  }

  const { data: availability } = await supabase
    .from("user_availability")
    .select("day_of_week, start_time, end_time, timezone")
    .eq("user_id", user.id)
    .order("day_of_week");

  return (
    <AvailabilityForm
      initialAvailability={availability ?? []}
    />
  );
}