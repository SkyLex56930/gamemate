import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
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
      bio,
      region,
      date_of_birth,
      avatar_url,
      is_onboarding_complete
    `)
    .eq("id", user.id)
    .single();

  if (!profile?.is_onboarding_complete) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-[#050812] text-white">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">

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
            Mon profil
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Modifie les informations principales de ton profil GameMate.
            Ces informations seront également utilisées dans l&apos;application.
          </p>
        </div>

        <div className="mt-8">
          <ProfileForm
            email={user.email ?? ""}
            initialProfile={{
              username: profile.username ?? "",
              display_name: profile.display_name ?? "",
              bio: profile.bio ?? "",
              region: profile.region ?? "",
              date_of_birth: profile.date_of_birth ?? "",
            }}
          />
        </div>
      </div>
    </main>
  );
}