import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step3_v3", "payload");
const required = [
  "package.json",
  "src/App.tsx",
  "src/pages/FindMatesPage.tsx",
  "src/components/NotificationCenter.tsx",
];
const payloadFiles = [
  "src/pages/FindMatesPage.tsx",
  "src/pages/FindMatesPage.css",
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
    fail(`Payload V3 introuvable : ${relative}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step3-v3-backup", stamp);
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
  if (!block.includes("onOpenFriends=")) {
    block = block.replace(
      /\n\s*onOpenSettings=\{\(\) => navigateTo\("profile"\)\}/,
      `\n                    onOpenFriends={() => navigateTo("friends")}\n                    onOpenSquads={() => navigateTo("squads")}\n                    onOpenSettings={() => navigateTo("profile")}`
    );
  }

  const expected = [
    "profileRegion=",
    "profileLanguage=",
    "onOpenMessages=",
    "onOpenFriends=",
    "onOpenSquads=",
  ];
  for (const property of expected) {
    if (!block.includes(property)) {
      fail(`La propriété ${property} n'a pas pu être raccordée à FindMatesScreen.`);
    }
  }

  return `${source.slice(0, componentStart)}${block}${source.slice(componentEnd + 2)}`;
}

const appPath = "src/App.tsx";
writeChanged(appPath, patchApp(fs.readFileSync(path.join(root, appPath), "utf8")));

for (const relative of payloadFiles) {
  writeChanged(relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step3-report.json"), `${JSON.stringify({
  version: "Companion Step 3 Social V3",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 3 Social V3 applique.");
console.log("[OK] Find Mates se synchronise maintenant en temps reel.");
console.log("[OK] Demandes, messages et squads sont relies de bout en bout.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
