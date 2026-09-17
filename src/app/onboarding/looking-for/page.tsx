import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LookingForForm from "./looking-for-form";

export const dynamic = "force-dynamic";

export default async function LookingForPage() {
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

  if ((profile?.onboarding_step ?? 1) < 5) {
    redirect("/onboarding/availability");
  }

  const { data: options } = await supabase
    .from("looking_for_options")
    .select("id, slug, label, description, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  const { data: currentOptions } = await supabase
    .from("user_looking_for")
    .select("option_id")
    .eq("user_id", user.id);

  return (
    <LookingForForm
      options={options ?? []}
      initialSelectedIds={(currentOptions ?? []).map(
        (item) => item.option_id
      )}
    />
  );
}