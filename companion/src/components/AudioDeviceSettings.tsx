import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { testSelectedOutput } from "../lib/audio";
import {
  createMicrophoneConstraints,
  friendlyMediaError,
  readAudioDevicePreferences,
  saveAudioDevicePreference,
  supportsAudioOutputSelection,
  type AudioDevicePreferences,
} from "../lib/mediaDevices";

type Props = {
  onNotice: (message: string) => void;
};

type PermissionState = "unknown" | "requesting" | "granted" | "denied";

export default function AudioDeviceSettings({ onNotice }: Props) {
  const initial = useMemo(readAudioDevicePreferences, []);
  const [preferences, setPreferences] = useState<AudioDevicePreferences>(initial);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [activeMicLabel, setActiveMicLabel] = useState("");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const outputSelectionAvailable = supportsAudioOutputSelection();
  const mediaAvailable = Boolean(navigator.mediaDevices);

  const stopMicTest = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (contextRef.current) void contextRef.current.close();
    contextRef.current = null;
    setMicTesting(false);
    setMicLevel(0);
    setActiveMicLabel("");
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!mediaAvailable) return;
    setLoadingDevices(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputs = devices.filter((device) => device.kind === "audioinput");
      const nextOutputs = devices.filter((device) => device.kind === "audiooutput");
      setInputs(nextInputs);
      setOutputs(nextOutputs);

      const hasLabels = devices.some((device) => Boolean(device.label));
      if (hasLabels) setPermission("granted");

      setPreferences((current) => {
        const inputExists = current.inputDeviceId === "default" || nextInputs.some((device) => device.deviceId === current.inputDeviceId);
        const outputExists = current.outputDeviceId === "default" || nextOutputs.some((device) => device.deviceId === current.outputDeviceId);
        const next = {
          ...current,
          inputDeviceId: inputExists ? current.inputDeviceId : "default",
          outputDeviceId: outputExists ? current.outputDeviceId : "default",
        };
        if (!inputExists) saveAudioDevicePreference("inputDeviceId", "default");
        if (!outputExists) saveAudioDevicePreference("outputDeviceId", "default");
        return next;
      });
    } catch (nextError) {
      setError(friendlyMediaError(nextError));
    } finally {
      setLoadingDevices(false);
    }
  }, [mediaAvailable]);

  useEffect(() => {
    void refreshDevices();
    if (!navigator.mediaDevices?.addEventListener) return undefined;
    const handleChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handleChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handleChange);
  }, [refreshDevices]);

  useEffect(() => stopMicTest, [stopMicTest]);

  function updatePreference<K extends keyof AudioDevicePreferences>(key: K, value: AudioDevicePreferences[K]) {
    stopMicTest();
    setPreferences((current) => ({ ...current, [key]: value }));
    saveAudioDevicePreference(key, value);
    setError("");
  }

  async function requestMicrophoneAccess() {
    if (!mediaAvailable) return;
    setPermission("requesting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: createMicrophoneConstraints(preferences),
        video: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      setPermission("granted");
      await refreshDevices();
      onNotice("Accès au microphone autorisé. Les périphériques sont à jour.");
    } catch (nextError) {
      setPermission("denied");
      setError(friendlyMediaError(nextError));
    }
  }

  async function startMicTest() {
    if (!mediaAvailable) return;
    stopMicTest();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: createMicrophoneConstraints(preferences),
        video: false,
      });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      audioContext.createMediaStreamSource(stream).connect(analyser);

      streamRef.current = stream;
      contextRef.current = audioContext;
      setPermission("granted");
      setMicTesting(true);
      setActiveMicLabel(stream.getAudioTracks()[0]?.label || "Microphone sélectionné");
      await refreshDevices();

      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        const decibels = rms > 0 ? 20 * Math.log10(rms) : -60;
        const normalizedLevel = Math.max(0, Math.min(100, ((decibels + 60) / 60) * 100));
        setMicLevel(Math.round(normalizedLevel));
        animationRef.current = requestAnimationFrame(measure);
      };
      measure();
    } catch (nextError) {
      setMicTesting(false);
      setPermission("denied");
      setError(friendlyMediaError(nextError));
    }
  }

  async function testSpeaker() {
    setError("");
    const played = await testSelectedOutput();
    if (played) onNotice("Son de test envoyé vers la sortie sélectionnée.");
    else setError("Le son de test n’a pas pu être joué sur cette sortie.");
  }

  if (!mediaAvailable) {
    return (
      <div className="audio-device-unavailable">
        <span>!</span>
        <div><strong>API audio indisponible</strong><small>Cette version du WebView Windows ne permet pas encore de gérer les périphériques.</small></div>
      </div>
    );
  }

  return (
    <div className="audio-device-center">
      <div className="audio-device-statusbar">
        <div>
          <span className={`audio-permission ${permission}`}><i />{permissionLabel(permission)}</span>
          <small>{inputs.length} entrée{inputs.length > 1 ? "s" : ""} · {outputs.length} sortie{outputs.length > 1 ? "s" : ""}</small>
        </div>
        <div>
          {permission !== "granted" && (
            <button type="button" className="audio-device-primary" disabled={permission === "requesting"} onClick={() => void requestMicrophoneAccess()}>
              {permission === "requesting" ? "Autorisation…" : "Autoriser le microphone"}
            </button>
          )}
          <button type="button" className="audio-device-secondary" disabled={loadingDevices} onClick={() => void refreshDevices()}>
            {loadingDevices ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </div>

      {error && <div className="audio-device-error"><span>!</span>{error}</div>}

      <div className="audio-device-grid">
        <section className="audio-device-card">
          <header><span>MIC</span><div><strong>Périphérique d’entrée</strong><small>Microphone utilisé par GameMate</small></div></header>
          <label>
            <span>Source d’entrée</span>
            <select value={preferences.inputDeviceId} onChange={(event) => updatePreference("inputDeviceId", event.target.value)}>
              <option value="default">Périphérique Windows par défaut</option>
              {inputs.filter((device) => device.deviceId !== "default").map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
              ))}
            </select>
          </label>

          <div className="audio-meter-block">
            <div><span>Niveau en direct</span><b>{micTesting ? `${micLevel}%` : "EN ATTENTE"}</b></div>
            <div className="audio-meter" style={{ "--mic-level": `${micLevel}%` } as CSSProperties}><i /></div>
            <small>{micTesting ? activeMicLabel : "Le test reste local et aucun son n’est enregistré."}</small>
          </div>

          <button type="button" className={`audio-test-button ${micTesting ? "stop" : ""}`} onClick={() => micTesting ? stopMicTest() : void startMicTest()}>
            <span>{micTesting ? "■" : "●"}</span>{micTesting ? "Arrêter le test" : "Tester le microphone"}
          </button>
        </section>

        <section className="audio-device-card">
          <header><span>OUT</span><div><strong>Périphérique de sortie</strong><small>Casque, haut-parleurs ou sortie externe</small></div></header>
          <label>
            <span>Destination audio</span>
            <select
              value={preferences.outputDeviceId}
              disabled={!outputSelectionAvailable}
              onChange={(event) => updatePreference("outputDeviceId", event.target.value)}
            >
              <option value="default">Périphérique Windows par défaut</option>
              {outputs.filter((device) => device.deviceId !== "default").map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || `Sortie audio ${index + 1}`}</option>
              ))}
            </select>
          </label>

          <div className="audio-output-note">
            <span>{outputSelectionAvailable ? "✓" : "i"}</span>
            <p>{outputSelectionAvailable ? "Les sons GameMate utilisent immédiatement cette sortie." : "Le WebView utilise la sortie Windows par défaut sur cet appareil."}</p>
          </div>

          <button type="button" className="audio-test-button" onClick={() => void testSpeaker()}>
            <span>▶</span>Tester la sortie
          </button>
        </section>
      </div>

      <section className="audio-processing">
        <header><div><strong>Traitement de la voix</strong><small>Appliqué au test micro et prêt pour le futur vocal GameMate.</small></div><span>LOCAL</span></header>
        <div>
          <ProcessingToggle label="Annulation d’écho" description="Limite le retour des haut-parleurs." checked={preferences.echoCancellation} onChange={(value) => updatePreference("echoCancellation", value)} />
          <ProcessingToggle label="Réduction du bruit" description="Atténue les bruits continus." checked={preferences.noiseSuppression} onChange={(value) => updatePreference("noiseSuppression", value)} />
          <ProcessingToggle label="Gain automatique" description="Uniformise le niveau de la voix." checked={preferences.autoGainControl} onChange={(value) => updatePreference("autoGainControl", value)} />
        </div>
      </section>
    </div>
  );
}

function ProcessingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={`audio-processing-toggle ${checked ? "active" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span><strong>{label}</strong><small>{description}</small></span><i><b /></i>
    </button>
  );
}

function permissionLabel(permission: PermissionState) {
  if (permission === "granted") return "Accès autorisé";
  if (permission === "denied") return "Accès refusé";
  if (permission === "requesting") return "Autorisation…";
  return "Autorisation requise";
}
