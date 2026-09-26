GameMate Companion V15 — Présence sociale
==========================================

Cette archive est un correctif incrémental à appliquer par-dessus la V14.

Contenu de la V15
-----------------
- Statuts En ligne, Absent, Ne pas déranger et Invisible.
- Statut personnalisé, jeu en cours et activité modifiables dans Paramètres.
- Présence réelle affichée dans l’accueil, les amis, les messages, les squads,
  la recherche de mates et les profils publics autorisés.
- Dernière activité protégée par un nouveau réglage de confidentialité.
- Présence visible uniquement par soi-même, ses amis acceptés et les membres de
  sa squad active. Le mode Invisible apparaît hors ligne pour les autres.
- Actualisation en direct et rafraîchissement silencieux sans écran de chargement.
- Invitation rapide d’un ami dans la squad depuis la page Amis.
- Les invitations respectent désormais le réglage « Invitations de squad » du
  destinataire et affichent un message compréhensible en cas de refus.
- En mode Ne pas déranger, les sons de notification entrants sont coupés. Le
  bouton de test audio des paramètres continue de fonctionner.
- Aucun jeu de données fictif n’a été ajouté.

Installation
------------
1. Fermer GameMate Companion.
2. Copier le dossier companion de cette archive par-dessus le dossier companion
   de la V14.
3. Depuis le dossier companion, lancer :
   npm install
   npm run build
4. Pour tester l’application :
   npm run tauri dev

Base de données
---------------
Le script SUPABASE_SOCIAL_PRESENCE_V15.sql est inclus pour une nouvelle instance
ou une restauration. Il est déjà installé sur le projet Supabase GameMate actuel :
ne pas le relancer sur ce projet.

Test recommandé avec deux comptes
---------------------------------
1. Connecter deux comptes déjà amis.
2. Compte A : Paramètres > Présence, choisir Absent et saisir une activité.
3. Compte B : vérifier l’état dans Amis, Messages et le profil du compte A.
4. Compte A : choisir Invisible ; le compte B doit le voir Hors ligne.
5. Compte A : masquer « Dernière activité » dans Confidentialité ; le compte B
   ne doit plus voir l’heure de dernière présence.
6. Compte B : inviter A dans sa squad depuis Amis, puis désactiver les invitations
   sur A et vérifier qu’une nouvelle invitation est refusée proprement.

Version
-------
Companion : 1.0.6
