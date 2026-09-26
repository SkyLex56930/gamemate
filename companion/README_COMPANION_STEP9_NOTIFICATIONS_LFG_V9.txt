GAMEMATE COMPANION — STEP 9 NOTIFICATIONS LFG V9
=================================================

INSTALLATION
------------
1. Ferme Companion et le serveur npm s'ils sont ouverts.
2. Décompresse TOUT le contenu du ZIP dans :
   C:\Users\Piraud\Desktop\gamemate\companion
3. Accepte la fusion/remplacement des fichiers si Windows le demande.
4. Double-clique sur APPLIQUER_COMPANION_STEP9_NOTIFICATIONS_LFG_V9.bat
5. Attends le message [OK].
6. Lance ensuite : npm run tauri build

Le correctif est cumulatif : il réapplique les étapes V1 à V8 avant la V9.
Une sauvegarde locale horodatée est créée avant chaque modification.

NOUVEAUTÉS
----------
- notifications LFG persistantes dans la cloche de Companion ;
- nouvelle candidature visible par le créateur de l'annonce ;
- acceptation ou refus visible par le joueur candidat ;
- retrait d'une candidature visible par le créateur ;
- compteur non lu actualisé par Supabase Realtime ;
- état lu/non lu conservé entre deux lancements ;
- bouton « Tout lire » pour les notifications LFG ;
- clic sur une notification : ouverture des annonces ou de la squad concernée ;
- accès « Annonces » directement depuis le bas du centre de notifications ;
- aucune donnée de démonstration ajoutée.

BASE DE DONNÉES
---------------
La base Supabase GameMate actuellement connectée a déjà reçu la V9.
SUPABASE_NOTIFICATIONS_LFG_V9.sql est fourni comme sauvegarde pour une autre base.
Ne le relance pas sur le projet actuel.

TEST CONSEILLÉ
--------------
1. Connecte deux vrais comptes GameMate.
2. Le compte A publie une annonce.
3. Le compte B candidate.
4. Vérifie que A reçoit la notification sans recharger l'application.
5. A accepte la candidature.
6. Vérifie que B reçoit la notification et qu'un clic ouvre la squad.

IMPORTANT
---------
La V9 dépend de la V8 pour les annonces LFG. L'installateur cumulatif installe
automatiquement les fichiers nécessaires dans le bon ordre.
