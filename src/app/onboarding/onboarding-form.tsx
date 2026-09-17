"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initialProfile: {
    username: string;
    displayName: string;
    bio: string;
    region: string;
    dateOfBirth: string;
  };
};

export default function OnboardingForm({ initialProfile }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState(initialProfile.username);
  const [displayName, setDisplayName] = useState(
    initialProfile.displayName
  );
  const [bio, setBio] = useState(initialProfile.bio);
  const [region, setRegion] = useState(initialProfile.region);
  const [dateOfBirth, setDateOfBirth] = useState(
    initialProfile.dateOfBirth
  );

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Session invalide. Reconnecte-toi.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username,
        display_name: displayName,
        bio,
        region,
        date_of_birth: dateOfBirth || null,
        onboarding_step: 2,
        is_onboarding_complete: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      setMessage(`Erreur : ${error.message}`);
      setLoading(false);
      return;
    }

    router.replace("/onboarding/games");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 text-sm font-semibold text-violet-400">
          Étape 1 sur 6
        </div>

        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
            GameMate
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Crée ton profil
          </h1>

          <p className="mt-3 text-slate-400">
            Commençons par quelques informations sur toi.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-white/10 bg-slate-900 p-8"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">
              Pseudo
            </label>

            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nom affiché
            </label>

            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Région
            </label>

            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="France"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Date de naissance
            </label>

            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Bio
            </label>

            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Parle un peu de toi..."
              className="w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Continuer"}
          </button>

          {message && (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}