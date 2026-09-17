"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProfileData = {
  username: string;
  display_name: string;
  bio: string;
  region: string;
  date_of_birth: string;
};

type Props = {
  email: string;
  initialProfile: ProfileData;
};

export default function ProfileForm({
  email,
  initialProfile,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] =
    useState<ProfileData>(initialProfile);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateField(
    field: keyof ProfileData,
    value: string
  ) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProfile() {
    setSaving(true);
    setMessage("");
    setError("");

    if (!profile.username.trim()) {
      setError("Ton pseudo est obligatoire.");
      setSaving(false);
      return;
    }

    if (profile.username.trim().length < 3) {
      setError(
        "Ton pseudo doit contenir au moins 3 caractères."
      );
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expirée.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        username: profile.username.trim(),
        display_name:
          profile.display_name.trim() || null,
        bio: profile.bio.trim() || null,
        region: profile.region.trim() || null,
        date_of_birth:
          profile.date_of_birth || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      if (
        updateError.message
          .toLowerCase()
          .includes("unique")
      ) {
        setError(
          "Ce pseudo est déjà utilisé par un autre joueur."
        );
      } else {
        setError(updateError.message);
      }

      setSaving(false);
      return;
    }

    setMessage("Profil mis à jour.");

    router.refresh();

    setSaving(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

      {/* FORMULAIRE */}
      <section className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8">
        <h2 className="text-xl font-bold">
          Informations générales
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          Ces informations sont visibles sur ton profil
          GameMate selon tes paramètres.
        </p>

        <div className="mt-8 space-y-6">

          {/* USERNAME */}
          <div>
            <label className="text-sm font-medium text-slate-300">
              Pseudo GameMate
            </label>

            <input
              value={profile.username}
              onChange={(event) =>
                updateField(
                  "username",
                  event.target.value
                )
              }
              maxLength={30}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-500/60"
            />

            <p className="mt-2 text-xs text-slate-600">
              Ton identifiant public sur GameMate.
            </p>
          </div>

          {/* DISPLAY NAME */}
          <div>
            <label className="text-sm font-medium text-slate-300">
              Nom affiché
            </label>

            <input
              value={profile.display_name}
              onChange={(event) =>
                updateField(
                  "display_name",
                  event.target.value
                )
              }
              maxLength={50}
              placeholder="Ex : Alex"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-violet-500/60"
            />
          </div>

          {/* EMAIL */}
          <div>
            <label className="text-sm font-medium text-slate-300">
              Adresse email
            </label>

            <input
              value={email}
              disabled
              className="mt-2 w-full cursor-not-allowed rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-slate-500"
            />

            <p className="mt-2 text-xs text-slate-600">
              La modification de l&apos;email sera
              disponible dans Compte & sécurité.
            </p>
          </div>

          {/* REGION */}
          <div>
            <label className="text-sm font-medium text-slate-300">
              Région
            </label>

            <input
              value={profile.region}
              onChange={(event) =>
                updateField(
                  "region",
                  event.target.value
                )
              }
              placeholder="Ex : France / Europe"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-violet-500/60"
            />
          </div>

          {/* DATE */}
          <div>
            <label className="text-sm font-medium text-slate-300">
              Date de naissance
            </label>

            <input
              type="date"
              value={profile.date_of_birth}
              onChange={(event) =>
                updateField(
                  "date_of_birth",
                  event.target.value
                )
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-500/60"
            />
          </div>

          {/* BIO */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                Bio
              </label>

              <span className="text-xs text-slate-600">
                {profile.bio.length}/300
              </span>
            </div>

            <textarea
              value={profile.bio}
              onChange={(event) =>
                updateField(
                  "bio",
                  event.target.value
                )
              }
              maxLength={300}
              rows={5}
              placeholder="Parle un peu de toi, de ton style de jeu..."
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-violet-500/60"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
              ✓ {message}
            </div>
          )}

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-6">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Enregistrement..."
                : "Enregistrer les modifications"}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push("/dashboard")
              }
              className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-300"
            >
              Annuler
            </button>
          </div>
        </div>
      </section>

      {/* PREVIEW */}
      <aside className="space-y-5">
        <div className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            Aperçu
          </p>

          <div className="mt-6 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-violet-400/30 bg-gradient-to-br from-violet-600 to-cyan-500 text-3xl font-bold shadow-[0_0_30px_rgba(124,58,237,0.2)]">
              {(profile.display_name ||
                profile.username ||
                "G")
                .slice(0, 1)
                .toUpperCase()}
            </div>

            <h3 className="mt-5 text-xl font-bold">
              {profile.display_name ||
                profile.username ||
                "GameMate"}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              @{profile.username || "player"}
            </p>

            {profile.region && (
              <p className="mt-3 text-xs text-slate-400">
                ◉ {profile.region}
              </p>
            )}
          </div>

          {profile.bio && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-sm leading-relaxed text-slate-400">
                {profile.bio}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-cyan-400/10 bg-cyan-400/[0.03] p-5">
          <p className="text-sm font-semibold text-cyan-300">
            Synchronisation GameMate
          </p>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Les modifications enregistrées ici
            utiliseront le même compte que le futur
            Companion GameMate.
          </p>
        </div>
      </aside>
    </div>
  );
}