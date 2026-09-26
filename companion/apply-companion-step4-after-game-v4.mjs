import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step4_v4", "payload");
const required = [
  "package.json",
  "src/App.tsx",
  "src/components/NotificationCenter.tsx",
  "src/components/NotificationCenter.css",
];
const payloadFiles = [
  "src/components/NotificationCenter.tsx",
  "src/components/NotificationCenter.css",
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
    fail(`Payload V4 introuvable : ${relative}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step4-v4-backup", stamp);
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

for (const relative of payloadFiles) {
  writeChanged(relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
}

const notificationSource = fs.readFileSync(
  path.join(root, "src/components/NotificationCenter.tsx"),
  "utf8"
);
for (const marker of [
  'from("deferred_social_actions")',
  'Après ma game',
  'notification-tabs',
]) {
  if (!notificationSource.includes(marker)) {
    fail(`Vérification V4 impossible : marqueur absent (${marker}).`);
  }
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step4-report.json"), `${JSON.stringify({
  version: "Companion Step 4 Après ma game V4",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 4 Apres ma game V4 applique.");
console.log("[OK] Files Maintenant / Apres ma game actives.");
console.log("[OK] Synchronisation multi-PC branchee sur Supabase.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
