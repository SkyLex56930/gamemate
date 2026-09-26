GAMEMATE COMPANION - STEP 6 PROFILS PUBLICS V6
==============================================

CE ZIP EST CUMULATIF
--------------------
Tu n'as pas besoin d'installer les V1, V2, V3, V4 ou V5 avant.

INSTALLATION
------------
1. Ferme Companion et le serveur npm en cours.
2. Décompresse TOUT le ZIP dans :
   C:\Users\Piraud\Desktop\gamemate\companion
3. Accepte la fusion des dossiers et le remplacement des fichiers du correctif.
4. Double-clique sur :
   APPLIQUER_COMPANION_STEP6_PROFILS_PUBLICS_V6.bat
5. Quand le build web est validé, lance dans PowerShell :
   npm run tauri build

CE QUE LA V6 AJOUTE
-------------------
- Refonte complète du profil des autres joueurs.
- Bannière, avatar, cadre cosmétique et identité GameMate.
- Bio, région et langue selon les choix du propriétaire.
- Jeux, plateformes, rangs, rôles, modes, micro et crossplay.
- Gaming DNA et intentions de recherche.
- Boutons contextuels réellement branchés :
  Ajouter en ami, Accepter, Refuser, Message et Inviter en squad.
- États réels : demande en attente, déjà ami, déjà dans la squad ou invitation envoyée.
- Blocage, déblocage et signalement reliés à Supabase.
- Nouvel onglet Confidentialité dans Mon profil.
- Réglages de visibilité et d'autorisations appliqués côté serveur.
- Aucun faux statut, aucun bouton décoratif.

SUPABASE
--------
La migration V6 est déjà installée et testée sur le projet Supabase gamemate.
Tu n'as rien à exécuter pour ce projet.

Le fichier SUPABASE_PUBLIC_PROFILES_V6.sql est inclus comme sauvegarde
idempotente de la migration.

TEST CONSEILLÉ AVEC DEUX COMPTES
--------------------------------
1. Avec A, ouvre Mon profil > Confidentialité et masque la bio.
2. Avec B, ouvre le profil public de A : la bio doit être indiquée privée.
3. Réactive la bio avec A et recharge le profil avec B.
4. Depuis B, envoie une demande d'ami à A.
5. Accepte depuis le profil de B ou depuis l'onglet Amis de A.
6. Vérifie que le bouton Message ouvre directement la bonne conversation.
7. Crée une squad avec B chef, puis invite A depuis son profil.
8. Teste enfin Bloquer puis Débloquer.

SAUVEGARDES
-----------
Chaque étape crée automatiquement un dossier de sauvegarde caché à la racine
du projet. Ne le supprime pas avant d'avoir terminé les tests.
