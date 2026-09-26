import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step6_v6", "payload");
const required = ["package.json", "src/App.tsx", "src/pages/ProfilePage.tsx"];
const payloadFiles = [
  "src/pages/PublicProfilePage.tsx",
  "src/pages/PublicProfilePage.css",
  "src/components/ProfilePrivacyPanel.tsx",
  "src/components/ProfilePrivacyPanel.css",
];

function fail(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    fail(`Fichier Companion introuvable : ${relative}`);
  }
}
for (const relative of payloadFiles) {
  if (!fs.existsSync(path.join(payloadRoot, relative))) {
    fail(`Payload V6 introuvable : ${relative}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step6-v6-backup", stamp);
const changed = [];

function backup(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) return;
  const destination = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writeChanged(relative, content) {
  const target = path.join(root, relative);
  const before = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (before === content) return;
  backup(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  changed.push(relative);
}

function patchApp(source) {
  const start = source.indexOf("<PublicProfilePage");
  if (start < 0) fail("Le bloc PublicProfilePage est introuvable dans src/App.tsx.");
  const end = source.indexOf("/>", start);
  if (end < 0) fail("Le bloc PublicProfilePage est incomplet dans src/App.tsx.");

  const block = `<PublicProfilePage
                userId={publicProfileUserId}
                onBack={() => setPublicProfileUserId(null)}
                onOpenMessages={(userId) => {
                  setPublicProfileUserId(null);
                  setMessageTargetUserId(userId);
                  navigateTo("messages");
                }}
                onOpenFriends={() => {
                  setPublicProfileUserId(null);
                  navigateTo("friends");
                }}
                onOpenSquads={() => {
                  setPublicProfileUserId(null);
                  navigateTo("squads");
                }}
                onOpenOwnProfile={() => {
                  setPublicProfileUserId(null);
                  navigateTo("profile");
                }}
              />`;

  return `${source.slice(0, start)}${block}${source.slice(end + 2)}`;
}

function patchProfilePage(source) {
  let next = source;

  if (!next.includes('import ProfilePrivacyPanel from "../components/ProfilePrivacyPanel";')) {
    const importMarker = 'import { getProfileCompletion, type ProfileCompletionTask } from "../lib/profileCompletion";';
    if (!next.includes(importMarker)) fail("Import profileCompletion introuvable dans ProfilePage.tsx.");
    next = next.replace(
      importMarker,
      `${importMarker}\nimport ProfilePrivacyPanel from "../components/ProfilePrivacyPanel";`
    );
  }

  if (!next.includes('"profile" | "setup" | "privacy" | "library"')) {
    next = next.replace(
      /useState<"profile"\s*\|\s*"setup"\s*\|\s*"library">\("profile"\)/,
      'useState<"profile" | "setup" | "privacy" | "library">("profile")'
    );
  }

  if (!next.includes('tab === "privacy" ? "active" : ""')) {
    const libraryTab = `        <button type="button" className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>`;
    if (!next.includes(libraryTab)) fail("Onglet Bibliothèque introuvable dans ProfilePage.tsx.");
    next = next.replace(
      libraryTab,
      `        <button type="button" className={tab === "privacy" ? "active" : ""} onClick={() => setTab("privacy")}>
          Confidentialité
        </button>
${libraryTab}`
    );
  }

  if (!next.includes('<ProfilePrivacyPanel />')) {
    const setupStart = next.indexOf("<ProfileSetup");
    if (setupStart < 0) fail("Bloc ProfileSetup introuvable dans ProfilePage.tsx.");
    const setupEnd = next.indexOf("/>", setupStart);
    if (setupEnd < 0) fail("Bloc ProfileSetup incomplet dans ProfilePage.tsx.");
    const tailStart = setupEnd + 2;
    const branch = next.slice(tailStart).match(/^\s*\)\s*:\s*\(/);
    if (!branch) fail("Transition vers la bibliothèque introuvable dans ProfilePage.tsx.");
    const replacement = `
      ) : tab === "privacy" ? (
        <ProfilePrivacyPanel />
      ) : (`;
    next = `${next.slice(0, tailStart)}${replacement}${next.slice(tailStart + branch[0].length)}`;
  }

  for (const marker of [
    'import ProfilePrivacyPanel from "../components/ProfilePrivacyPanel";',
    '"profile" | "setup" | "privacy" | "library"',
    'tab === "privacy" ? "active" : ""',
    "<ProfilePrivacyPanel />",
  ]) {
    if (!next.includes(marker)) fail(`Raccord confidentialité incomplet : ${marker}`);
  }

  return next;
}

writeChanged("src/App.tsx", patchApp(fs.readFileSync(path.join(root, "src/App.tsx"), "utf8")));
writeChanged(
  "src/pages/ProfilePage.tsx",
  patchProfilePage(fs.readFileSync(path.join(root, "src/pages/ProfilePage.tsx"), "utf8"))
);

for (const relative of payloadFiles) {
  writeChanged(relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
}

const publicProfile = fs.readFileSync(path.join(root, "src/pages/PublicProfilePage.tsx"), "utf8");
for (const marker of [
  '"get_public_player_profile"',
  '"send_friend_request"',
  '"invite_to_squad"',
  '"block_user"',
  '"create_user_report"',
]) {
  if (!publicProfile.includes(marker)) fail(`Vérification du profil public impossible : ${marker}`);
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step6-report.json"), `${JSON.stringify({
  version: "Companion Step 6 Profils publics V6",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 6 Profils publics V6 applique.");
console.log("[OK] Profils joueurs, actions sociales et confidentialite raccordes.");
console.log("[OK] Aucune fonctionnalite fictive ajoutee.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
