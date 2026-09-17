import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GamingDnaForm from "./gaming-dna-form";

export const dynamic = "force-dynamic";

export default async function GamingDnaPage() {
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

  if ((profile?.onboarding_step ?? 1) < 3) {
    redirect("/onboarding/games");
  }

  const { data: tags } = await supabase
    .from("gaming_dna_tags")
    .select("id, slug, label, category, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  const { data: currentTags } = await supabase
    .from("user_gaming_dna")
    .select("tag_id")
    .eq("user_id", user.id);

  return (
    <GamingDnaForm
      tags={tags ?? []}
      initialSelectedIds={(currentTags ?? []).map(
        (item) => item.tag_id
      )}
    />
  );
}