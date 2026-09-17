import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      username,
      display_name,
      is_onboarding_complete
    `)
    .eq("id", user.id)
    .single();

  if (!profile?.is_onboarding_complete) {
    redirect("/onboarding");
  }

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
            Compte GameMate
          </p>

          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Paramètres
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Gère ton compte, ta sécurité et les préférences liées à
            GameMate.
          </p>
        </div>

        <div className="mt-8">
          <SettingsForm
            currentEmail={user.email ?? ""}
            username={profile.username ?? ""}
            displayName={
              profile.display_name ??
              profile.username ??
              "GameMate"
            }
          />
        </div>
      </div>
    </main>
  );
}