"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  currentEmail: string;
  username: string;
  displayName: string;
};

export default function SettingsForm({
  currentEmail,
  username,
  displayName,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [newEmail, setNewEmail] = useState(currentEmail);

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [emailLoading, setEmailLoading] =
    useState(false);

  const [passwordLoading, setPasswordLoading] =
    useState(false);

  const [sessionLoading, setSessionLoading] =
    useState(false);

  const [emailMessage, setEmailMessage] =
    useState("");

  const [emailError, setEmailError] =
    useState("");

  const [passwordMessage, setPasswordMessage] =
    useState("");

  const [passwordError, setPasswordError] =
    useState("");

  const [sessionError, setSessionError] =
    useState("");

  async function changeEmail(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setEmailLoading(true);
    setEmailError("");
    setEmailMessage("");

    const email = newEmail
      .trim()
      .toLowerCase();

    if (!email) {
      setEmailError(
        "Entre une adresse email."
      );
      setEmailLoading(false);
      return;
    }

    if (email === currentEmail.toLowerCase()) {
      setEmailError(
        "Cette adresse est déjà celle de ton compte."
      );
      setEmailLoading(false);
      return;
    }

    const { error } =
      await supabase.auth.updateUser({
        email,
      });

    if (error) {
      setEmailError(error.message);
      setEmailLoading(false);
      return;
    }

    setEmailMessage(
      "Demande envoyée. Vérifie tes emails pour confirmer la nouvelle adresse."
    );

    setEmailLoading(false);
  }

  async function changePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setPasswordLoading(true);
    setPasswordError("");
    setPasswordMessage("");

    if (newPassword.length < 8) {
      setPasswordError(
        "Le mot de passe doit contenir au moins 8 caractères."
      );
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(
        "Les deux mots de passe ne correspondent pas."
      );
      setPasswordLoading(false);
      return;
    }

    const { error } =
      await supabase.auth.updateUser({
        password: newPassword,
      });

    if (error) {
      setPasswordError(error.message);
      setPasswordLoading(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");

    setPasswordMessage(
      "Ton mot de passe a bien été modifié."
    );

    setPasswordLoading(false);
  }

  async function logoutEverywhere() {
    const confirmed = window.confirm(
      "Déconnecter GameMate de toutes tes sessions ?"
    );

    if (!confirmed) {
      return;
    }

    setSessionLoading(true);
    setSessionError("");

    const { error } =
      await supabase.auth.signOut({
        scope: "global",
      });

    if (error) {
      setSessionError(error.message);
      setSessionLoading(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  async function logoutCurrentDevice() {
    setSessionLoading(true);
    setSessionError("");

    const { error } =
      await supabase.auth.signOut({
        scope: "local",
      });

    if (error) {
      setSessionError(error.message);
      setSessionLoading(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">

      {/* NAVIGATION PARAMETRES */}
      <aside>
        <div className="sticky top-6 rounded-3xl border border-white/10 bg-[#0A0F1D] p-3">
          <a
            href="#account"
            className="flex items-center gap-3 rounded-xl bg-violet-500/10 px-4 py-3 text-sm font-semibold text-violet-300"
          >
            <span>◎</span>
            Compte
          </a>

          <a
            href="#security"
            className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <span>◇</span>
            Sécurité
          </a>

          <a
            href="#notifications"
            className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <span>♢</span>
            Notifications
          </a>

          <a
            href="#privacy"
            className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <span>◉</span>
            Confidentialité
          </a>

          <a
            href="#danger"
            className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-red-400/70 transition hover:bg-red-500/5 hover:text-red-300"
          >
            <span>!</span>
            Zone sensible
          </a>
        </div>
      </aside>

      {/* CONTENU */}
      <div className="space-y-6">

        {/* ACCOUNT */}
        <section
          id="account"
          className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-xl">
              ◎
            </div>

            <div>
              <h2 className="text-xl font-bold">
                Compte
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Informations utilisées pour accéder à
                ton compte GameMate.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-[#070B16] p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-600">
              Profil associé
            </p>

            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 font-bold">
                {displayName
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div>
                <p className="font-semibold">
                  {displayName}
                </p>

                <p className="text-sm text-slate-500">
                  @{username}
                </p>
              </div>
            </div>
          </div>

          {/* EMAIL */}
          <form
            onSubmit={changeEmail}
            className="mt-8"
          >
            <div>
              <h3 className="font-semibold">
                Adresse email
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Cette adresse est utilisée pour te
                connecter à GameMate.
              </p>
            </div>

            <div className="mt-5 max-w-xl">
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Email
              </label>

              <input
                type="email"
                value={newEmail}
                onChange={(event) =>
                  setNewEmail(
                    event.target.value
                  )
                }
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-500/60"
              />
            </div>

            {emailError && (
              <div className="mt-4 max-w-xl rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {emailError}
              </div>
            )}

            {emailMessage && (
              <div className="mt-4 max-w-xl rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                ✓ {emailMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={emailLoading}
              className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/10 px-5 py-3 text-sm font-semibold text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {emailLoading
                ? "Modification..."
                : "Modifier mon adresse email"}
            </button>
          </form>
        </section>

        {/* SECURITY */}
        <section
          id="security"
          className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/5 text-xl">
              ◇
            </div>

            <div>
              <h2 className="text-xl font-bold">
                Sécurité
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Protège l&apos;accès à ton compte
                GameMate.
              </p>
            </div>
          </div>

          {/* PASSWORD */}
          <form
            onSubmit={changePassword}
            className="mt-8"
          >
            <h3 className="font-semibold">
              Modifier le mot de passe
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Utilise un mot de passe différent de
              ceux que tu utilises ailleurs.
            </p>

            <div className="mt-5 grid max-w-2xl gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Nouveau mot de passe
                </label>

                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  placeholder="8 caractères minimum"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-violet-500/60"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Confirmation
                </label>

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  placeholder="Répète le mot de passe"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-violet-500/60"
                />
              </div>
            </div>

            {passwordError && (
              <div className="mt-4 max-w-2xl rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {passwordError}
              </div>
            )}

            {passwordMessage && (
              <div className="mt-4 max-w-2xl rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                ✓ {passwordMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={passwordLoading}
              className="mt-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {passwordLoading
                ? "Modification..."
                : "Changer mon mot de passe"}
            </button>
          </form>

          {/* SESSIONS */}
          <div className="mt-10 border-t border-white/10 pt-8">
            <h3 className="font-semibold">
              Sessions
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Contrôle les appareils qui peuvent
              accéder à ton compte.
            </p>

            <div className="mt-5 space-y-3">
              <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#070B16] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    Cette session
                  </p>

                  <p className="mt-1 text-xs text-emerald-400">
                    ● Actuellement connectée
                  </p>
                </div>

                <button
                  type="button"
                  disabled={sessionLoading}
                  onClick={
                    logoutCurrentDevice
                  }
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06]"
                >
                  Se déconnecter
                </button>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#070B16] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    Tous les appareils
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Révoque les autres sessions
                    GameMate.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={sessionLoading}
                  onClick={logoutEverywhere}
                  className="rounded-xl border border-orange-400/20 bg-orange-400/5 px-4 py-2.5 text-sm font-medium text-orange-300 transition hover:bg-orange-400/10"
                >
                  Tout déconnecter
                </button>
              </div>
            </div>

            {sessionError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {sessionError}
              </div>
            )}
          </div>

          {/* 2FA */}
          <div className="mt-8 border-t border-white/10 pt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    Double authentification
                  </h3>

                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-500">
                    Bientôt
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Ajoute une deuxième protection à
                  ton compte.
                </p>
              </div>

              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-600"
              >
                Configurer
              </button>
            </div>
          </div>
        </section>

        {/* NOTIFICATIONS */}
        <section
          id="notifications"
          className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8"
        >
          <div className="flex items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">
                  Notifications
                </h2>

                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-500">
                  Prochaine étape
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Choisis les notifications que
                GameMate pourra t&apos;envoyer.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3 opacity-60">
            {[
              [
                "Demandes d'amis",
                "Recevoir une notification lorsqu'un joueur t'ajoute.",
              ],
              [
                "Invitations de groupe",
                "Squads, teams et sessions de jeu.",
              ],
              [
                "Messages importants",
                "Informations importantes liées à ton compte.",
              ],
              [
                "Nouveautés GameMate",
                "Versions, fonctionnalités et actualités.",
              ],
            ].map(([title, description]) => (
              <div
                key={title}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#070B16] p-5"
              >
                <div>
                  <p className="text-sm font-medium">
                    {title}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {description}
                  </p>
                </div>

                <div className="h-6 w-11 rounded-full bg-white/10 p-1">
                  <div className="h-4 w-4 rounded-full bg-slate-600" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PRIVACY */}
        <section
          id="privacy"
          className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">
              Confidentialité
            </h2>

            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-500">
              Prochaine étape
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            Tu pourras choisir quelles informations
            sont visibles par les autres joueurs.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#070B16] p-5">
              <p className="font-medium">
                Visibilité du profil
              </p>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Public, amis uniquement ou privé.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#070B16] p-5">
              <p className="font-medium">
                Statut en ligne
              </p>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Choisir qui peut voir ta présence.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#070B16] p-5">
              <p className="font-medium">
                Gaming DNA
              </p>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Contrôler l&apos;affichage de tes
                préférences de jeu.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#070B16] p-5">
              <p className="font-medium">
                Disponibilités
              </p>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Garder tes horaires privés ou les
                rendre visibles.
              </p>
            </div>
          </div>
        </section>

        {/* DANGER */}
        <section
          id="danger"
          className="rounded-3xl border border-red-500/20 bg-red-500/[0.025] p-6 md:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
            Zone sensible
          </p>

          <h2 className="mt-2 text-xl font-bold">
            Gestion du compte
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Ces actions auront un impact important
            sur ton compte GameMate.
          </p>

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-red-500/10 bg-[#070B16] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                Supprimer mon compte
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Suppression définitive du compte et
                de ses données associées.
              </p>
            </div>

            <button
              type="button"
              disabled
              title="Cette fonction sera ajoutée avec une procédure de confirmation sécurisée."
              className="cursor-not-allowed rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-400/50"
            >
              Supprimer le compte
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}