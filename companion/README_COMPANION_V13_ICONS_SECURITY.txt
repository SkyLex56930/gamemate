GAMEMATE COMPANION V13 — VERSION 1.0.4
======================================

Cette mise à jour s'installe par-dessus la V12.

CONTENU
-------
- Système d'icônes SVG interne, cohérent et sans dépendance supplémentaire.
- Remplacement des emojis et caractères temporaires dans les écrans principaux.
- Icônes accessibles, vectorielles et automatiquement colorées par le thème.
- Durcissement des fonctions Supabase SECURITY DEFINER.
- Version du Companion mise à jour vers 1.0.4.

INSTALLATION SUR LE PROJET V12
------------------------------
1. Fermer le Companion et le serveur de développement.
2. Copier le contenu du dossier "companion" de ce correctif dans le dossier
   "companion" du projet, en acceptant le remplacement des fichiers.
3. Ouvrir PowerShell dans le dossier companion.
4. Exécuter : npm install
5. Tester : npm run build
6. Lancer : npm run tauri dev

SUPABASE
--------
Le durcissement V13 est déjà appliqué au projet Supabase GameMate actuel.
Ne relance pas le SQL sur ce projet.

Pour une nouvelle instance Supabase uniquement, exécuter une fois :
SUPABASE_SECURITY_HARDENING_V13.sql

VÉRIFICATIONS EFFECTUÉES
------------------------
- TypeScript : OK
- Build Vite : OK
- 109 modules transformés
- 0 fonction interne SECURITY DEFINER accessible au rôle anon
- Statistiques publiques du site conservées
- RPC des joueurs connectés conservées

