import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step2_v2", "payload");
const required = ["package.json", "src/App.tsx", "src/pages/FindMatesPage.tsx", "src/pages/FindMatesPage.css"];

function fail(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Fichier Companion introuvable : ${relative}`);
}
for (const relative of ["src/pages/FindMatesPage.tsx", "src/pages/FindMatesPage.css"]) {
  if (!fs.existsSync(path.join(payloadRoot, relative))) fail(`Payload introuvable : ${relative}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step2-v2-backup", stamp);
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
  const componentStart = source.indexOf("<FindMatesScreen");
  if (componentStart < 0) fail("Le bloc FindMatesScreen est introuvable dans src/App.tsx.");
  const componentEnd = source.indexOf("/>", componentStart);
  if (componentEnd < 0) fail("Le bloc FindMatesScreen est incomplet dans src/App.tsx.");

  let block = source.slice(componentStart, componentEnd + 2);
  if (!block.includes("profileRegion=")) {
    block = block.replace(
      /profileCompletion=\{profileCompletion\.percent\}/,
      `profileCompletion={profileCompletion.percent}\n                    profileRegion={profile?.region ?? null}\n                    profileLanguage={profile?.language ?? null}`
    );
  }
  if (!block.includes("onOpenMessages=")) {
    block = block.replace(
      /\n\s*onOpenSettings=\{\(\) => navigateTo\("profile"\)\}/,
      `\n                    onOpenMessages={(userId) => {\n                      setMessageTargetUserId(userId);\n                      navigateTo("messages");\n                    }}\n                    onOpenSettings={() => navigateTo("profile")}`
    );
  }

  if (!block.includes("profileRegion=") || !block.includes("onOpenMessages=")) {
    fail("Impossible d'ajouter les nouvelles propriétés Find Mates sans risque.");
  }
  return `${source.slice(0, componentStart)}${block}${source.slice(componentEnd + 2)}`;
}

const appPath = "src/App.tsx";
const appBefore = fs.readFileSync(path.join(root, appPath), "utf8");
writeChanged(appPath, patchApp(appBefore));

for (const relative of ["src/pages/FindMatesPage.tsx", "src/pages/FindMatesPage.css"]) {
  writeChanged(relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step2-report.json"), `${JSON.stringify({
  version: "Companion Step 2 V2",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 2 V2 applique.");
console.log("[OK] Trouver des mates refondu avec actions reelles.");
console.log("[OK] Le profil incomplet ne bloque pas l'application.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
