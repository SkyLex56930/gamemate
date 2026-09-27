GAMEMATE COMPANION V17 — MESSAGES FLUIDES
=========================================

Version de l'application : 1.0.8

OBJECTIF
--------
Supprimer le rechargement visible de la page Messages lorsqu'un nouveau
message arrive ou vient d'être envoyé.

CHANGEMENTS
-----------
- Le paquet inclut maintenant `src/components/Icon.tsx` avec les icônes
  `phone` et `phone-off`, nécessaires aux boutons d'appel de Messages.
- Les nouveaux messages Realtime sont ajoutés directement au fil ouvert.
- Les messages modifiés sont mis à jour en place.
- Les messages supprimés disparaissent sans recharger la conversation.
- La liste des conversations se resynchronise en arrière-plan, sans afficher
  de nouvel écran « Chargement... ».
- Le compteur de non-lus est calculé depuis l'état déjà affiché et se met à
  jour immédiatement.
- Une conversation ouverte est marquée lue sans masquer son contenu.
- Une ancienne requête lente ne peut plus remplacer le contenu d'une autre
  conversation ouverte entre-temps.
- Après envoi, la synchronisation reste invisible.
- Le défilement reste en bas quand l'utilisateur y est déjà, mais un nouveau
  message ne l'arrache plus à un ancien passage qu'il est en train de relire.

BASE DE DONNÉES
---------------
Aucune migration SQL supplémentaire n'est nécessaire pour ce correctif.

VALIDATION
----------
- TypeScript : OK
- Build Vite de production : OK
- Vérification React/ESLint : aucune erreur

IMPORTANT — TRAVAIL EFFECTUÉ SUR UN AUTRE PC
--------------------------------------------
Le briefing du 27/09/2026 mentionne OfficialMessagesPanel,
AnnouncementBanner, PlayersPage et AnnouncementsPage. Ces fichiers ne sont ni
dans la copie locale disponible ici, ni sur la branche GitHub origin/main au
moment du contrôle.

Ne remplace donc pas aveuglément ton MessagesPage plus récent s'il contient
déjà l'onglet officiel GameMate. Il faut reporter la logique temps réel de ce
correctif dans ce fichier récent, ou synchroniser d'abord cette version du
projet afin de fusionner les deux travaux proprement.

TEST CONSEILLÉ
--------------
1. Ouvrir la même conversation sur deux comptes.
2. Envoyer plusieurs messages dans les deux sens.
3. Vérifier qu'aucun écran « Chargement... » ne réapparaît.
4. Changer rapidement de conversation pendant une réception.
5. Remonter dans un ancien échange, recevoir un message, puis vérifier que la
   lecture ne saute pas brutalement en bas.
