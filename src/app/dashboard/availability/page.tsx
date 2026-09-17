import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AvailabilitySettingsForm from "./availability-settings-form";

export const dynamic = "force-dynamic";

export default async function AvailabilitySettingsPage() {
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

  const { data: availability } = await supabase
    .from("user_availability")
    .select(`
      id,
      day_of_week,
      start_time,
      end_time,
      timezone
    `)
    .eq("user_id", user.id)
    .order("day_of_week");

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
            Mes disponibilités
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Indique les moments où tu joues généralement.
            GameMate pourra utiliser ces créneaux pour te proposer
            des mates disponibles au même moment.
          </p>
        </div>

        <div className="mt-8">
          <AvailabilitySettingsForm
            initialAvailability={availability ?? []}
          />
        </div>
      </div>
    </main>
  );
}