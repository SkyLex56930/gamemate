GAMEMATE COMPANION V18 — APPELS VIDÉO ET PARTAGE D'ÉCRAN
=========================================================

Version de l'application : 1.0.9

CONTENU
-------
- Appels audio et vidéo privés depuis Messages.
- Boutons téléphone et caméra dans une conversation et dans la liste d'amis.
- Appel vidéo entrant acceptable avec caméra ou en audio seulement.
- Caméra activable et désactivable à tout moment pendant un appel.
- Partage d'un écran ou d'une fenêtre pendant un appel audio ou vidéo.
- Sélection de l'écran gérée par le sélecteur sécurisé natif de Windows/WebView2.
- Le bouton de partage est absent si la fonction n'est pas disponible.
- Aperçu local discret et grande zone pour la caméra ou l'écran du correspondant.
- Retour automatique à la caméra lorsque le partage d'écran est arrêté.
- Micro, mode sourd, périphérique de sortie et raccrochage restent disponibles.
- Historique différenciant les appels vocaux et vidéo, avec rappel dans le même mode.
- Canaux Realtime privés et flux WebRTC directs, sans enregistrement par GameMate.

BASE DE DONNÉES
---------------
Le script SUPABASE_DIRECT_MEDIA_CALLS_V18.sql est inclus pour une nouvelle
instance ou une restauration. Il est déjà installé sur le projet Supabase
GameMate actuel : ne pas le relancer sur ce projet.

INSTALLATION
------------
1. Fermer GameMate Companion.
2. Copier le dossier companion de cette archive par-dessus le dossier existant.
3. Dans le dossier companion, lancer :
   npm install
   npm run build
4. Pour tester :
   npm run tauri dev

TEST RECOMMANDÉ AVEC DEUX COMPTES
---------------------------------
1. Connecter deux comptes amis sur deux PC ou deux sessions distinctes.
2. Lancer un appel audio, puis activer la caméra pendant l'appel.
3. Lancer un appel vidéo et l'accepter une fois avec caméra, une fois sans.
4. Tester micro, mode sourd, caméra et changement de page.
5. Cliquer sur Partager l'écran et sélectionner un moniteur ou une fenêtre.
6. Avec plusieurs écrans, sélectionner successivement chacun d'eux.
7. Arrêter le partage depuis GameMate puis depuis le bouton Windows de fin.
8. Vérifier le retour automatique à la caméra et l'historique dans Messages.

RÉSEAU — IMPORTANT POUR LA BÊTA
-------------------------------
Le STUN public peut suffire sur certains réseaux domestiques. Pour rendre les
appels vidéo et le partage d'écran fiables entre tous les types de réseaux,
configurer un serveur TURN avec :
VITE_WEBRTC_TURN_URLS
VITE_WEBRTC_TURN_USERNAME
VITE_WEBRTC_TURN_CREDENTIAL

Sans TURN, deux utilisateurs placés derrière des NAT stricts ou certains
réseaux d'entreprise peuvent ne pas réussir à établir la connexion WebRTC.
