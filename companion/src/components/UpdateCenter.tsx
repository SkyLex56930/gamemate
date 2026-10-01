import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

type UpdateStatus = {
  current_version: string;
  latest_version: string;
  update_available: boolean;
};

type UpdatePhase = "checking" | "current" | "available" | "installing" | "error";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function UpdateCenter() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<UpdatePhase>("checking");
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [popoverPosition, setPopoverPosition] = useState({ top: 76, left: 12 });
  const checkingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const checkForUpdate = useCallback(async (quiet = false) => {
    if (!isTauri || checkingRef.current) return;
    checkingRef.current = true;
    if (!quiet) setPhase("checking");

    try {
      const nextStatus = await invoke<UpdateStatus>("check_companion_update");
      setStatus(nextStatus);
      setError("");
      setPhase(nextStatus.update_available ? "available" : "current");
    } catch (checkError) {
      setError(String(checkError));
      if (!quiet) setPhase("error");
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauri) {
      setPhase("current");
      return;
    }

    const initialCheck = window.setTimeout(() => void checkForUpdate(), 1200);
    const interval = window.setInterval(() => void checkForUpdate(true), CHECK_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate(true);
    };

    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (!open) return;

    const positionPopover = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(310, window.innerWidth - 24);
      setPopoverPosition({
        top: bounds.bottom + 8,
        left: Math.max(12, Math.min(window.innerWidth - width - 12, bounds.right - width)),
      });
    };

    positionPopover();
    window.addEventListener("resize", positionPopover);
    return () => window.removeEventListener("resize", positionPopover);
  }, [open]);

  async function installUpdate() {
    if (!status?.update_available || phase === "installing") return;
    setPhase("installing");
    setError("");

    try {
      await invoke("install_companion_update");
    } catch (installError) {
      setError(String(installError));
      setPhase("error");
    }
  }

  const updateAvailable = phase === "available" || (phase === "installing" && Boolean(status?.update_available));

  return (
    <>
      <div className={`gm-update-center ${updateAvailable ? "has-update" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="gm-update-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={updateAvailable ? `Mise à jour ${status?.latest_version} disponible` : "Vérifier les mises à jour"}
        title={updateAvailable ? "Une mise à jour est disponible" : "Mises à jour"}
      >
        <Icon name={phase === "checking" ? "refresh" : "download"} size={17} />
        {updateAvailable && <i aria-hidden="true" />}
      </button>
      </div>

      {open && createPortal(
        <div className="gm-update-popover" style={popoverPosition} role="dialog" aria-label="Mises à jour GameMate">
          <div className="gm-update-popover-head">
            <span><Icon name="download" size={18} /></span>
            <div>
              <strong>Mises à jour</strong>
              <small>GameMate Companion</small>
            </div>
          </div>

          {phase === "checking" && (
            <div className="gm-update-state checking">
              <Icon name="refresh" size={20} />
              <strong>Vérification en cours…</strong>
              <p>Recherche de la dernière version stable.</p>
            </div>
          )}

          {phase === "current" && (
            <div className="gm-update-state current">
              <Icon name="check" size={20} />
              <strong>Companion est à jour</strong>
              <p>Version {status?.current_version ?? "actuelle"}</p>
              <button type="button" className="secondary" onClick={() => void checkForUpdate()} disabled={!isTauri}>Revérifier</button>
            </div>
          )}

          {(phase === "available" || phase === "installing") && (
            <div className="gm-update-state available">
              <span className="gm-update-version">V{status?.latest_version}</span>
              <strong>Une nouvelle version est prête</strong>
              <p>Le Companion se fermera, puis l’installateur prendra le relais.</p>
              <button type="button" className="primary" onClick={() => void installUpdate()} disabled={phase === "installing"}>
                <Icon name={phase === "installing" ? "refresh" : "download"} size={16} />
                {phase === "installing" ? "Téléchargement…" : "Mettre à jour maintenant"}
              </button>
              <small>Version installée : {status?.current_version}</small>
            </div>
          )}

          {phase === "error" && (
            <div className="gm-update-state error">
              <Icon name="alert-circle" size={20} />
              <strong>Vérification impossible</strong>
              <p>{error || "Une erreur inattendue est survenue."}</p>
              <button type="button" className="secondary" onClick={() => void checkForUpdate()}>Réessayer</button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
