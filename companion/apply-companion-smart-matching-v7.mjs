import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step7_v7", "payload");
const required = ["package.json", "src/App.tsx", "src/pages/ProfilePage.tsx"];
const payloadFiles = [
  "src/pages/FindMatesPage.tsx",
  "src/pages/FindMatesPage.css",
  "src/components/ProfilePrivacyPanel.tsx",
];

function fail(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Fichier Companion introuvable : ${relative}`);
}
for (const relative of payloadFiles) {
  if (!fs.existsSync(path.join(payloadRoot, relative))) fail(`Payload V7 introuvable : ${relative}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step7-v7-backup", stamp);
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
  const start = source.indexOf("<FindMatesScreen");
  if (start < 0) fail("Le bloc FindMatesScreen est introuvable dans src/App.tsx.");
  const end = source.indexOf("/>", start);
  if (end < 0) fail("Le bloc FindMatesScreen est incomplet dans src/App.tsx.");

  const block = `<FindMatesScreen
                    session={session}
                    userGames={userGames}
                    gamingDna={gamingDna}
                    lookingFor={lookingFor}
                    availability={availability}
                    profileCompletion={profileCompletion.percent}
                    onLogin={() => setShowLogin(true)}
                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}
                    onOpenMessages={(userId) => {
                      setMessageTargetUserId(userId);
                      navigateTo("messages");
                    }}
                    onOpenFriends={() => navigateTo("friends")}
                    onOpenSquads={() => navigateTo("squads")}
                    onOpenSettings={() => navigateTo("profile")}
                  />`;

  return `${source.slice(0, start)}${block}${source.slice(end + 2)}`;
}

writeChanged("src/App.tsx", patchApp(fs.readFileSync(path.join(root, "src/App.tsx"), "utf8")));
for (const relative of payloadFiles) {
  writeChanged(relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
}

const findMates = fs.readFileSync(path.join(root, "src/pages/FindMatesPage.tsx"), "utf8");
for (const marker of [
  '"find_mates_smart_v7"',
  '"send_friend_request"',
  '"respond_friend_request"',
  '"invite_to_squad"',
  "Pourquoi {mate.compatibility_score}% ?",
]) {
  if (!findMates.includes(marker)) fail(`Vérification du matching impossible : ${marker}`);
}

const privacy = fs.readFileSync(path.join(root, "src/components/ProfilePrivacyPanel.tsx"), "utf8");
for (const marker of ['"update_my_profile_privacy_v2"', "show_availability"]) {
  if (!privacy.includes(marker)) fail(`Vérification confidentialité impossible : ${marker}`);
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step7-report.json"), `${JSON.stringify({
  version: "Companion Step 7 Matching intelligent V7",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 7 Matching intelligent V7 applique.");
console.log("[OK] Scores reels, filtres, explications et actions sociales raccordes.");
console.log("[OK] Les disponibilites respectent maintenant la confidentialite.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
