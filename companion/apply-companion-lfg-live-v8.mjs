import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step8_v8", "payload");
const required = ["package.json", "src/App.tsx", "src/pages/FindMatesPage.tsx"];
const payloadFiles = [
  "src/pages/FindMatesPage.tsx",
  "src/pages/FindMatesPage.css",
  "src/components/LfgBoard.tsx",
  "src/components/LfgBoard.css",
];

function fail(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Fichier Companion introuvable : ${relative}`);
}
for (const relative of payloadFiles) {
  if (!fs.existsSync(path.join(payloadRoot, relative))) fail(`Payload V8 introuvable : ${relative}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step8-v8-backup", stamp);
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

const findMates = fs.readFileSync(path.join(root, "src/pages/FindMatesPage.tsx"), "utf8");
for (const marker of [
  'import LfgBoard from "../components/LfgBoard";',
  'type DiscoveryMode = "matching" | "live";',
  'discoveryMode === "live"',
  "<LfgBoard",
]) {
  if (!findMates.includes(marker)) fail(`Vérification de la page Trouver des mates impossible : ${marker}`);
}

const lfgBoard = fs.readFileSync(path.join(root, "src/components/LfgBoard.tsx"), "utf8");
for (const marker of [
  '"get_lfg_feed_v8"',
  '"create_lfg_post_v8"',
  '"apply_lfg_post_v8"',
  '"respond_lfg_application_v8"',
  'table: "lfg_posts_v8"',
]) {
  if (!lfgBoard.includes(marker)) fail(`Vérification du LFG V8 impossible : ${marker}`);
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step8-report.json"), `${JSON.stringify({
  version: "Companion Step 8 LFG Live V8",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 8 LFG Live V8 applique.");
console.log("[OK] Annonces, candidatures, temps reel et squads raccordes.");
console.log("[OK] Aucune annonce ou aucun joueur fictif ajoute.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
