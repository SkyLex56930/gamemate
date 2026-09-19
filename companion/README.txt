GameMate — Squads 2.0 Complete

Backend Supabase :
Déjà installé directement dans le projet gamemate.

Fonctions disponibles :
- création de squad
- nom / jeu / taille max
- invitations réservées aux amis
- accepter / refuser
- annuler une invitation
- chef / membre
- transfert du rôle chef
- expulser un membre
- quitter
- dissoudre
- chat de squad temps réel
- notifications globales d'invitation squad
- son de notification
- invitation réelle depuis la page Amis

Fichiers à remplacer/ajouter :

src/App.tsx
src/App.css
src/pages/SquadsPage.tsx
src/pages/SquadsPage.css
src/pages/FriendsPage.tsx
src/pages/FriendsPage.css
src/pages/MessagesPage.tsx
src/pages/MessagesPage.css
src/components/NotificationCenter.tsx
src/components/NotificationCenter.css
src/lib/audio.ts
public/sounds/notification-bell.wav
public/sounds/message-send.wav

Test rapide :
1. Compte A crée une squad.
2. A invite B depuis Squads > Inviter ou depuis Amis.
3. B reçoit une notification + son.
4. B accepte.
5. Les deux apparaissent dans Membres.
6. Ouvrir Chat et tester les messages en temps réel.
7. Tester transfert chef, quitter, exclure et dissoudre.
