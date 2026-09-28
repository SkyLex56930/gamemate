# Alertes Android GameMate

Les messages, demandes d'amis et invitations d'équipe déclenchent des alertes pour les appareils inscrits. Le script `companion/SUPABASE_MOBILE_PUSH_V20.sql` est déjà appliqué au projet Supabase GameMate. Ne le réexécute pas pour installer l'application.

## Préparer Expo et Firebase

1. Dans `mobile`, connecte ton compte Expo avec `npx eas-cli@latest login`, puis lie le projet avec `npx eas-cli@latest init`. Le numéro `extra.eas.projectId` est alors ajouté à la configuration de l'application.
2. Dans la [console Firebase](https://console.firebase.google.com/), crée un projet et une application Android avec l'identifiant **`com.skylex.gamemate`**. Télécharge `google-services.json` dans `mobile/`.
3. Ajoute `"googleServicesFile": "./google-services.json"` dans l'objet `expo.android` de `mobile/app.json`.
4. Dans Firebase, sous **Paramètres du projet → Comptes de service**, génère une clé privée JSON. Dans `mobile`, exécute `npx eas-cli@latest credentials`, puis choisis **Android → production → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1) → Upload a new service account key**. La clé privée ne doit jamais être commise sur GitHub.

Pour les étapes Firebase détaillées, suis la [documentation Expo FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/). `google-services.json` contient des identifiants publics, mais garde la clé du compte de service privée.

## Installer et essayer

Depuis `mobile` :

```powershell
npm install
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

Ouvre le lien APK donné par EAS sur le téléphone Android pour installer le client de développement. Le téléphone et l'ordinateur doivent pouvoir joindre le serveur Expo de développement. Connecte-toi dans GameMate, accepte les notifications, puis fais envoyer un message ou une invitation depuis un autre compte. Le téléphone destinataire doit recevoir l'alerte ; un appui ouvre la conversation ou l'écran Invitations.

Pour un APK autonome, sans serveur de développement, construis ensuite le profil `preview` :

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Avant ce dernier build, configure `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dans l'environnement EAS `preview` (les mêmes valeurs publiques que dans ton fichier `.env` local). Le profil `preview` sélectionne déjà cet environnement. Expo Go ne reçoit pas les notifications distantes de cette application.
