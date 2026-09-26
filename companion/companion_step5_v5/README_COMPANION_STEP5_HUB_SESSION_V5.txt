GAMEMATE COMPANION - STEP 5 HUB DE SESSION V5
==============================================

CE ZIP EST CUMULATIF
--------------------
Tu n'as pas besoin d'installer les V1, V2, V3 ou V4 avant.

INSTALLATION
------------
1. Ferme Companion et le serveur npm en cours.
2. Décompresse TOUT le ZIP dans :
   C:\Users\Piraud\Desktop\gamemate\companion
3. Accepte la fusion des dossiers et le remplacement des fichiers du correctif.
4. Double-clique sur :
   APPLIQUER_COMPANION_STEP5_HUB_SESSION_V5.bat
5. Quand le build web est validé, lance dans PowerShell :
   npm run tauri build

CE QUE LA V5 AJOUTE
-------------------
- Un vrai écran de fin de partie à la place du simple message "Bien joué".
- Résumé de session : jeu, mode, région, durée et nombre de joueurs.
- Liste réelle des joueurs ayant participé à la session.
- Boutons Profil, Ajouter en ami, Voir la demande et Message selon la situation.
- Favoris de joueurs privés et persistants.
- Historique privé des six dernières sessions.
- Rejouer avec la même squad ou préparer une autre session pour le chef.
- Proposition de rejouer via le chat pour les autres membres.
- Aucun bouton social fictif : chaque action est reliée à Supabase.
- Toutes les fonctions des V1 à V4 sont conservées.

SUPABASE
--------
Les tables et fonctions V11 + V5 sont déjà installées et testées sur le projet
Supabase gamemate. Tu n'as rien à exécuter pour ce projet.

Les fichiers SUPABASE_GAME_SESSIONS_V11.sql et SUPABASE_HUB_SESSION_V5.sql sont
inclus uniquement comme sauvegardes idempotentes.

TEST CONSEILLÉ AVEC DEUX COMPTES
--------------------------------
1. Crée ou ouvre une squad avec les deux comptes.
2. Onglet Session de jeu : lance un ready-check.
3. Mets les deux comptes sur Prêt puis lance et termine la partie.
4. Vérifie que le nouveau Hub de session apparaît sur les deux comptes.
5. Depuis le compte A, ajoute B en ami puis accepte avec B.
6. Vérifie que le bouton devient Message et ouvre la bonne conversation.
7. Active Favori, ferme et relance Companion : le favori doit rester actif.
8. Clique sur Rejouer avec le chef : un nouveau ready-check doit apparaître.

SAUVEGARDES
-----------
Chaque étape crée automatiquement un dossier de sauvegarde caché à la racine
du projet. Ne le supprime pas avant d'avoir terminé les tests.
