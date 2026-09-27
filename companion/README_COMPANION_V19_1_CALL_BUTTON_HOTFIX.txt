GAMEMATE COMPANION V19.1 — CORRECTIF BOUTONS D'APPEL
====================================================

Version de l'application : 1.0.11

PROBLÈME CORRIGÉ
----------------
- Les boutons Appel et Appel vidéo pouvaient rester sans effet.
- Le gestionnaire global d'appels est désormais explicitement remonté dans App.tsx.
- Le bouton et le gestionnaire échangent un accusé de réception interne.
- Un clic valide affiche immédiatement « Préparation de l'appel… ».
- Si le gestionnaire n'est pas chargé, un message visible apparaît après 600 ms
  au lieu de laisser l'utilisateur sans réponse.
- Les erreurs inattendues lors du lancement sont maintenant affichées et journalisées.

HISTORIQUE D'APPELS
-------------------
- L'erreur HTTP 400 de get_my_direct_call_history_v18 est corrigée.
- La cause était une ambiguïté PL/pgSQL entre la colonne status et la colonne de
  sortie status de la fonction.
- SUPABASE_DIRECT_CALL_HOTFIX_V19_1.sql est inclus pour une nouvelle instance.
- Le correctif SQL est déjà installé sur le projet Supabase GameMate actuel :
  ne pas relancer ce script sur ce projet.

INSTALLATION
------------
1. Fermer complètement GameMate depuis son icône dans la zone de notification.
2. Copier tout le contenu de cette archive par-dessus le dossier companion.
3. Dans le dossier companion, lancer :
   npm install
   npm run tauri dev

TEST RAPIDE
-----------
1. Se connecter puis ouvrir Messages.
2. Sélectionner un ami et cliquer sur le téléphone ou la caméra.
3. Vérifier que « Préparation de l'appel… » apparaît immédiatement.
4. La fenêtre d'appel doit ensuite indiquer que GameMate appelle le joueur.
5. Ce test fonctionne même si l'autre joueur est hors ligne : l'appel doit quand
   même s'ouvrir puis afficher l'état hors ligne ou l'appel manqué.

SI UN MESSAGE « MODULE D'APPEL NON CHARGÉ » APPARAÎT
---------------------------------------------------
La copie n'a pas remplacé src/App.tsx ou l'ancienne application est encore en
mémoire. Fermer GameMate depuis la zone de notification, recopier l'archive en
acceptant le remplacement des fichiers, puis relancer npm run tauri dev.

VÉRIFICATIONS EFFECTUÉES
------------------------
- Compilation TypeScript + Vite réussie en version 1.0.11.
- Analyse ciblée des fichiers d'appel : aucune erreur.
- Fonction Supabase testée avec le compte GameMate connecté : réponse valide.
- Exécution de la fonction réservée au rôle authenticated ; accès anon refusé.

REMARQUE WINDOWS
----------------
La compilation Tauri Windows doit être exécutée sur le PC Windows disposant de
Rust/Cargo. Le build web a été validé dans l'environnement de préparation.
