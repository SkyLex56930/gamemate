GAMEMATE COMPANION — NETTOYAGE V1
=================================

OBJECTIF
--------
Ce correctif recentre Companion sur ses fonctions utiles après l'abandon de
l'overlay en jeu. Il ne supprime ni le vocal de squad, ni les périphériques
audio, ni les messages, ni les amis, ni les profils.

MODIFICATIONS
-------------
- Retrait de la page, de la fenêtre Tauri, du raccourci global et des
  permissions de l'ancien overlay.
- Retrait du pont localStorage overlay dans le vocal de squad, sans modifier
  le fonctionnement WebRTC du vocal.
- Suppression du bouton d'appel direct non fonctionnel dans Messages.
- La recherche principale indique maintenant clairement « Trouver des mates ».
- Correction du titre « Réglages » affiché deux fois dans Paramètres.
- Ajout d'un bouton « Réessayer » après les erreurs de chargement dans :
  Trouver des mates, Amis, Messages, Squads, Profil et Support.
- Conservation des états vides existants, tous basés sur les vraies données.

INSTALLATION
------------
1. Ferme GameMate Companion.
2. Décompresse le ZIP à la RACINE du dossier companion.
3. Vérifie que APPLIQUER_NETTOYAGE_COMPANION_V1.bat est à côté de package.json.
4. Double-clique sur APPLIQUER_NETTOYAGE_COMPANION_V1.bat.
5. Le script applique le nettoyage et lance automatiquement npm run build.
6. Si le build est valide, lance ensuite dans PowerShell :

   npm run tauri build

SÉCURITÉ
--------
Avant chaque modification ou suppression, le fichier original est copié dans :

  .companion-cleanup-v1-backup\DATE-ET-HEURE\

Le correctif peut être relancé : les changements ne sont pas dupliqués.

IMPORTANT
---------
Les dossiers autonomes external-overlay/native-overlay ont déjà leur propre
outil de désinstallation. Ce correctif s'occupe uniquement des branchements
restants à l'intérieur de Companion.
