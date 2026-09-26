import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step9_v9", "payload");
const required = [
  "package.json",
  "src/App.tsx",
  "src/components/NotificationCenter.tsx",
  "src/components/NotificationCenter.css",
  "src/pages/FindMatesPage.tsx",
];
const payloadFiles = [
  "src/components/NotificationCenter.tsx",
  "src/components/NotificationCenter.css",
  "src/pages/FindMatesPage.tsx",
];

function fail(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Fichier Companion introuvable : ${relative}`);
}
for (const relative of payloadFiles) {
  if (!fs.existsSync(path.join(payloadRoot, relative))) fail(`Payload V9 introuvable : ${relative}`);
}

const originalApp = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
let nextApp = originalApp;
const notificationCenterBlock = () => nextApp.match(/<NotificationCenter\b[\s\S]*?\/>/)?.[0] ?? "";

if (!notificationCenterBlock().includes('onOpenFindMates={() => navigateTo("mates")}')) {
  const notificationCenterPattern = /(<NotificationCenter\b[\s\S]*?\r?\n)([ \t]*)onOpenSquads=\{\(\) => navigateTo\("squads"\)\}\r?\n([ \t]*\/>)/;
  if (!notificationCenterPattern.test(nextApp)) {
    fail("Impossible de raccorder le centre de notifications à Trouver des mates dans src/App.tsx.");
  }
  nextApp = nextApp.replace(
    notificationCenterPattern,
    '$1$2onOpenSquads={() => navigateTo("squads")}\n$2onOpenFindMates={() => navigateTo("mates")}\n$3'
  );
}

const payloadContents = new Map(
  payloadFiles.map((relative) => [relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8")])
);

for (const [relative, markers] of Object.entries({
  "src/components/NotificationCenter.tsx": [
    '"get_my_notifications_v9"',
    '"get_unread_notification_count_v9"',
    '"mark_notification_read_v9"',
    'table: "user_notifications_v9"',
    'onOpenFindMates: () => void',
  ],
  "src/pages/FindMatesPage.tsx": [
    'sessionStorage.getItem("gamemate-find-mates-mode")',
    'window.addEventListener("gamemate:open-lfg"',
  ],
})) {
  const content = payloadContents.get(relative) ?? "";
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`Vérification V9 impossible dans ${relative} : ${marker}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step9-v9-backup", stamp);
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

writeChanged("src/App.tsx", nextApp);
for (const [relative, content] of payloadContents) writeChanged(relative, content);

const installedNotificationCenter = fs.readFileSync(
  path.join(root, "src/components/NotificationCenter.tsx"),
  "utf8"
);
const installedApp = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
if (!installedNotificationCenter.includes('"get_my_notifications_v9"')) {
  fail("Le centre de notifications V9 n’a pas été installé correctement.");
}
const installedNotificationBlock = installedApp.match(/<NotificationCenter\b[\s\S]*?\/>/)?.[0] ?? "";
if (!installedNotificationBlock.includes('onOpenFindMates={() => navigateTo("mates")}')) {
  fail("Le raccordement V9 de src/App.tsx n’a pas été installé correctement.");
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step9-report.json"), `${JSON.stringify({
  version: "Companion Step 9 Notifications LFG V9",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 9 Notifications LFG V9 applique.");
console.log("[OK] Notifications persistantes, compteur, lecture et navigation raccordes.");
console.log("[OK] La page Trouver des mates s'ouvre directement sur Annonces en direct.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
