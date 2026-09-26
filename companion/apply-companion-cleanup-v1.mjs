import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const required = ["package.json", "src/App.tsx", "src-tauri/tauri.conf.json", "src-tauri/src/lib.rs", "src-tauri/Cargo.toml"];

function fail(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    fail(`Place ce correctif a la racine du dossier companion. Fichier introuvable : ${relative}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-cleanup-v1-backup", stamp);
const changed = [];
const removed = [];
const skipped = [];

function backup(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function patchText(relative, transform) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    skipped.push(relative);
    return;
  }
  const before = fs.readFileSync(target, "utf8");
  const after = transform(before);
  if (after === before) return;
  backup(relative);
  fs.writeFileSync(target, after, "utf8");
  changed.push(relative);
}

function removeFile(relative) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) return;
  backup(relative);
  fs.rmSync(target, { force: true });
  removed.push(relative);
}

function appendOnce(source, marker, css) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${css.trim()}\n`;
}

function cleanApp(source) {
  let next = source
    .replace(/^import\s+OverlayPage\s+from\s+["']\.\/pages\/OverlayPage["'];?\s*\r?\n/gm, "")
    .replace("Rechercher un joueur, une team, un jeu...", "Trouver des mates...");

  const overlayWrapper = /function\s+App\s*\(\s*\)\s*\{\s*return\s+new URLSearchParams\(window\.location\.search\)\.get\(["']window["']\)\s*===\s*["']overlay["']\s*\?\s*<OverlayPage\s*\/>\s*:\s*<MainCompanionApp\s*\/>;?\s*\}\s*(?=export\s+default\s+App\s*;)/m;
  if (overlayWrapper.test(next)) {
    next = next.replace(overlayWrapper, "");
    next = next.replace(/function\s+MainCompanionApp\s*\(\s*\)/, "function App()");
  }
  return next;
}

function cleanRust(source) {
  let next = source
    .replace(/^\s*mod\s+overlay_hotkey\s*;\s*\r?\n/gm, "")
    .replace(/^\s*overlay_hotkey::install\(app\)\?;\s*\r?\n/gm, "");

  next = next.replace(/\s*\.setup\(\|app\|\s*\{\s*Ok\(\(\)\)\s*\}\)/m, "");
  return next;
}

function cleanCargo(source) {
  return source
    .replace(/^tauri-plugin-global-shortcut\s*=.*\r?\n/gm, "")
    .replace(/^raw-window-handle\s*=.*\r?\n/gm, "");
}

function cleanVoiceBridge(source) {
  let next = source
    .replace(/type\s+OverlayVoiceCommand\s*=\s*\{[\s\S]*?\};\s*\r?\n\r?\n/, "")
    .replace(/^const OVERLAY_VOICE_COMMAND_KEY.*\r?\nconst OVERLAY_VOICE_STATE_KEY.*\r?\n\r?\n/m, "")
    .replace(/^\s*const lastOverlayCommandAtRef = useRef\(0\);\s*\r?\n/m, "")
    .replace(/\r?\n\s*useEffect\(\(\) => \{\s*localStorage\.setItem\(OVERLAY_VOICE_STATE_KEY,[\s\S]*?\}, \[channelName, deafened, joined, muted\]\);\s*/m, "\n")
    .replace(/\r?\n\s*useEffect\(\(\) => \{\s*function applyStoredOverlayCommand[\s\S]*?\}, \[applyVoiceControls, joined\]\);\s*/m, "\n");
  return next;
}

patchText("src/App.tsx", cleanApp);
patchText("src-tauri/src/lib.rs", cleanRust);
patchText("src-tauri/Cargo.toml", cleanCargo);
patchText("src/components/SquadVoiceRoom.tsx", cleanVoiceBridge);

patchText("src-tauri/tauri.conf.json", (source) => {
  let config;
  try {
    config = JSON.parse(source);
  } catch (error) {
    fail(`src-tauri/tauri.conf.json n'est pas valide : ${error.message}`);
  }
  if (Array.isArray(config.app?.windows)) {
    config.app.windows = config.app.windows.filter((window) => (
      window?.label !== "overlay" && !String(window?.url ?? "").includes("window=overlay")
    ));
  }
  if (Array.isArray(config.app?.security?.capabilities)) {
    config.app.security.capabilities = config.app.security.capabilities.filter((item) => item !== "overlay-capability");
  }
  return `${JSON.stringify(config, null, 2)}\n`;
});

patchText("src/pages/SettingsPage.tsx", (source) => source
  .replace(/(\s*<div className="settings-nav-title"><span>RÉGLAGES<\/span><b>6 modules<\/b><\/div>)\s*\1/, "$1")
  .replace(/^\s*["']gamemate-overlay-[^"']+["'],?\s*\r?\n/gm, ""));

patchText("src/pages/MessagesPage.tsx", (source) => source
  .replace(
    "{error && <div className=\"messages-error\">{error}</div>}",
    `{error && <div className="messages-error"><span>{error}</span><button type="button" onClick={() => { setError(""); void loadConversations(); void loadFriends(); if (selectedConversationId) void loadMessages(selectedConversationId); }}>Réessayer</button></div>}`
  )
  .replace(/\s*<button type="button" disabled title="Les appels vocaux seront activés avec le système d’appel réel" aria-label="Appel vocal indisponible">\s*☎\s*<\/button>/m, ""));

patchText("src/pages/FriendsPage.tsx", (source) => source.replace(
  `{error || notice}\n        </div>`,
  `{error || notice}\n          {error && <button type="button" onClick={() => void loadAll()}>Réessayer</button>}\n        </div>`
));

patchText("src/pages/SquadsPage.tsx", (source) => source.replace(
  `{error && <div className="team-notice error">{error}</div>}`,
  `{error && <div className="team-notice error"><span>{error}</span><button type="button" onClick={() => void loadState()}>Réessayer</button></div>}`
));

patchText("src/pages/ProfilePage.tsx", (source) => source.replace(
  `{error || notice}\n        </div>`,
  `{error || notice}\n          {error && <button type="button" onClick={() => void loadCustomization()}>Réessayer</button>}\n        </div>`
));

patchText("src/pages/SupportPage.tsx", (source) => source.replace(
  `{error && <div className="support-error">{error}</div>}`,
  `{error && <div className="support-error"><span>{error}</span><button type="button" onClick={() => { setError(""); void loadTickets(); void loadReports(); if (selectedTicketId) void loadMessages(selectedTicketId); }}>Réessayer</button></div>}`
));

patchText("src/pages/FindMatesPage.tsx", (source) => source.replace(
  `{error && <div className="fmx-error">{error}</div>}`,
  `{error && <div className="fmx-error"><span>{error}</span><button type="button" onClick={() => void searchMates()}>Réessayer</button></div>}`
));

const retryCss = `/* companion-cleanup-v1: retry actions */
.friends-notice.error,
.messages-error,
.team-notice.error,
.prc-notice.error,
.support-error,
.fmx-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.friends-notice.error button,
.messages-error button,
.team-notice.error button,
.prc-notice.error button,
.support-error button,
.fmx-error button {
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 9px;
  padding: 7px 11px;
  color: #fff;
  background: rgba(255, 255, 255, .08);
  cursor: pointer;
}

.friends-notice.error button:hover,
.messages-error button:hover,
.team-notice.error button:hover,
.prc-notice.error button:hover,
.support-error button:hover,
.fmx-error button:hover { background: rgba(255, 255, 255, .14); }`;

for (const css of [
  "src/pages/FriendsPage.css",
  "src/pages/MessagesPage.css",
  "src/pages/SquadsPage.css",
  "src/pages/ProfilePage.css",
  "src/pages/SupportPage.css",
  "src/pages/FindMatesPage.css",
]) {
  patchText(css, (source) => appendOnce(source, "companion-cleanup-v1: retry actions", retryCss));
}

for (const relative of [
  "src/pages/OverlayPage.tsx",
  "src/pages/OverlayPage.css",
  "src-tauri/src/overlay_hotkey.rs",
  "src-tauri/capabilities/overlay.json",
]) {
  removeFile(relative);
}

const report = {
  version: "Companion Cleanup V1",
  appliedAt: new Date().toISOString(),
  changed,
  removed,
  skipped,
  backup: path.relative(root, backupRoot),
};
fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "cleanup-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Nettoyage Companion V1 applique.");
console.log(`[OK] ${changed.length} fichier(s) corrige(s).`);
console.log(`[OK] ${removed.length} fichier(s) overlay retire(s).`);
console.log("[OK] Le vocal de squad, les messages, le profil et l'audio sont conserves.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
console.log("\nEtape suivante : npm run build puis npm run tauri build");
