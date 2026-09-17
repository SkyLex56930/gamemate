import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GamingDnaSettingsForm from "./gaming-dna-settings-form";

export const dynamic = "force-dynamic";

export default async function GamingDnaSettingsPage() {
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

  const { data: tags } = await supabase
    .from("gaming_dna_tags")
    .select(`
      id,
      slug,
      label,
      category,
      sort_order
    `)
    .eq("is_active", true)
    .order("category")
    .order("sort_order");

  const { data: selectedTags } = await supabase
    .from("user_gaming_dna")
    .select("tag_id")
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
            Gaming DNA
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Modifie les traits qui décrivent le mieux ta façon de jouer.
            GameMate utilisera ces informations pour améliorer le matching.
          </p>
        </div>

        <div className="mt-8">
          <GamingDnaSettingsForm
            tags={tags ?? []}
            initialSelectedTagIds={
              selectedTags?.map((item) => item.tag_id) ?? []
            }
          />
        </div>
      </div>
    </main>
  );
}