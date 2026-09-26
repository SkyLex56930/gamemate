import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const payloadRoot = path.join(root, "companion_step5_v5", "payload");
const required = [
  "package.json",
  "src/App.tsx",
  "src/pages/SquadsPage.tsx",
  "src/components/SquadGameSession.tsx",
];
const payloadFiles = [
  "src/components/SquadGameSession.tsx",
  "src/components/SessionAfterGameHub.tsx",
  "src/components/SessionAfterGameHub.css",
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
    fail(`Payload V5 introuvable : ${relative}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".companion-step5-v5-backup", stamp);
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

function patchSquadsPage(source) {
  let next = source;

  if (!next.includes("onOpenFriends: () => void;")) {
    next = next.replace(
      /type Props = \{\s*session: Session \| null;\s*onLogin: \(\) => void;\s*\};/,
      `type Props = {\n  session: Session | null;\n  onLogin: () => void;\n  onOpenFriends: () => void;\n  onOpenMessages: (userId: string) => void;\n  onOpenProfile: (userId: string) => void;\n};`
    );
  }

  if (!next.includes("export default function SquadsPage({\n  session,")) {
    next = next.replace(
      "export default function SquadsPage({ session, onLogin }: Props) {",
      `export default function SquadsPage({\n  session,\n  onLogin,\n  onOpenFriends,\n  onOpenMessages,\n  onOpenProfile,\n}: Props) {`
    );
  }

  const componentStart = next.indexOf("<SquadGameSession");
  if (componentStart < 0) fail("Le bloc SquadGameSession est introuvable dans SquadsPage.tsx.");
  const componentEnd = next.indexOf("/>", componentStart);
  if (componentEnd < 0) fail("Le bloc SquadGameSession est incomplet dans SquadsPage.tsx.");

  let block = next.slice(componentStart, componentEnd + 2);
  if (!block.includes("onOpenFriends=")) {
    block = block.replace(
      /onOpenChat=\{\(\) => setTab\("chat"\)\}/,
      `onOpenChat={() => setTab("chat")}\n                onOpenFriends={onOpenFriends}\n                onOpenMessages={onOpenMessages}\n                onOpenProfile={onOpenProfile}`
    );
  }
  next = `${next.slice(0, componentStart)}${block}${next.slice(componentEnd + 2)}`;

  for (const marker of [
    "onOpenFriends: () => void;",
    "onOpenMessages: (userId: string) => void;",
    "onOpenProfile: (userId: string) => void;",
    "onOpenFriends={onOpenFriends}",
  ]) {
    if (!next.includes(marker)) fail(`Raccord SquadsPage incomplet : ${marker}`);
  }

  return next;
}

function patchApp(source) {
  const componentStart = source.indexOf("<SquadsPage");
  if (componentStart < 0) fail("Le bloc SquadsPage est introuvable dans src/App.tsx.");
  const componentEnd = source.indexOf("/>", componentStart);
  if (componentEnd < 0) fail("Le bloc SquadsPage est incomplet dans src/App.tsx.");

  let block = source.slice(componentStart, componentEnd + 2);
  if (!block.includes("onOpenMessages=")) {
    block = `<SquadsPage\n                    session={session}\n                    onLogin={() => setShowLogin(true)}\n                    onOpenFriends={() => navigateTo("friends")}\n                    onOpenMessages={(userId) => {\n                      setMessageTargetUserId(userId);\n                      navigateTo("messages");\n                    }}\n                    onOpenProfile={(userId) => setPublicProfileUserId(userId)}\n                  />`;
  }

  for (const marker of ["onOpenFriends=", "onOpenMessages=", "onOpenProfile="]) {
    if (!block.includes(marker)) fail(`Raccord App incomplet : ${marker}`);
  }

  return `${source.slice(0, componentStart)}${block}${source.slice(componentEnd + 2)}`;
}

const squadsPath = "src/pages/SquadsPage.tsx";
const appPath = "src/App.tsx";
writeChanged(squadsPath, patchSquadsPage(fs.readFileSync(path.join(root, squadsPath), "utf8")));
writeChanged(appPath, patchApp(fs.readFileSync(path.join(root, appPath), "utf8")));

for (const relative of payloadFiles) {
  writeChanged(relative, fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
}

const hubSource = fs.readFileSync(
  path.join(root, "src/components/SessionAfterGameHub.tsx"),
  "utf8"
);
for (const marker of [
  'rpc("get_session_hub"',
  'rpc("get_my_recent_game_sessions"',
  'rpc("set_session_player_favorite"',
  'rpc("send_friend_request"',
]) {
  if (!hubSource.includes(marker)) fail(`Vérification V5 impossible : marqueur absent (${marker}).`);
}

fs.mkdirSync(backupRoot, { recursive: true });
fs.writeFileSync(path.join(backupRoot, "step5-report.json"), `${JSON.stringify({
  version: "Companion Step 5 Hub de session V5",
  appliedAt: new Date().toISOString(),
  changed,
}, null, 2)}\n`, "utf8");

console.log("\n============================================================");
console.log("[OK] Companion Step 5 Hub de session V5 applique.");
console.log("[OK] Fin de partie, historique et actions sociales raccordes.");
console.log("[OK] Favoris de joueurs prives actifs.");
console.log(`[SAUVEGARDE] ${path.relative(root, backupRoot)}`);
console.log("============================================================");
