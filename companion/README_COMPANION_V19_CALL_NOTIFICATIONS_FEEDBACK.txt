GAMEMATE COMPANION V19 — APPELS, NOTIFICATIONS ET AVIS QUALITÉ
================================================================

Version de l'application : 1.0.10

CONTENU
-------
- Détection de la présence du destinataire au lancement de l'appel.
- Sonnerie et message différents quand le joueur est hors ligne.
- Compte à rebours visible pendant les 30 secondes de tentative d'appel.
- Notification GameMate persistante pour chaque appel entrant ou manqué.
- Ouverture directe de la conversation depuis la notification GameMate.
- Notification Windows native lorsque Companion est masqué ou en arrière-plan.
- Fermeture de la fenêtre vers la zone de notification Windows : les appels
  continuent d'être reçus tant que GameMate n'est pas quitté depuis l'icône.
- Fenêtre de notation après un appel réellement décroché et terminé.
- Note de 1 à 5 étoiles, catégories de problème et commentaire facultatif.
- Durée et correspondant affichés dans la fenêtre de retour qualité.
- Avis stockés dans direct_call_feedback avec lecture limitée au propriétaire.

BASE DE DONNÉES
---------------
Le script SUPABASE_DIRECT_CALL_EXPERIENCE_V19.sql est inclus pour une nouvelle
instance ou une restauration. Il est déjà installé sur le projet Supabase
GameMate actuel : ne pas le relancer sur ce projet.

INSTALLATION
------------
1. Fermer complètement GameMate depuis son icône dans la zone de notification.
2. Copier le dossier companion de cette archive par-dessus le dossier existant.
3. Dans le dossier companion, lancer :
   npm install
   npm run build
4. Pour tester en développement :
   npm run tauri dev
5. Pour produire l'application Windows installable :
   npm run tauri build

NOTIFICATIONS WINDOWS
---------------------
- Les notifications natives sont fiables avec une application Windows installée.
- En mode développement, Windows peut afficher PowerShell comme nom d'émetteur.
- Cliquer sur la croix masque désormais Companion au lieu de le fermer.
- Clic gauche sur l'icône GameMate : rouvrir l'application.
- Clic droit puis « Quitter GameMate » : arrêter complètement l'application.

TEST RECOMMANDÉ AVEC DEUX COMPTES
---------------------------------
1. Installer/lancer Companion avec deux comptes amis sur deux PC.
2. Mettre le second compte en ligne, l'appeler et vérifier la sonnerie normale.
3. Mettre le second compte hors ligne, l'appeler et vérifier le message hors ligne.
4. Reconnecter le second compte et vérifier l'appel dans Activité GameMate.
5. Masquer sa fenêtre avec la croix, relancer un appel et vérifier la notification Windows.
6. Décrocher, parler quelques secondes, raccrocher des deux côtés.
7. Vérifier la fenêtre d'avis, la durée, les étoiles, les catégories et le commentaire.
8. Envoyer une note de chaque côté et vérifier direct_call_feedback dans Supabase.

LIMITES CONNUES
---------------
- Une notification Windows nécessite que Companion soit encore lancé en arrière-plan.
- Une notification sur téléphone nécessite la future application mobile/PWA ainsi
  qu'un service de push et l'autorisation de l'utilisateur. Cette V19 prépare la
  notification persistante GameMate, mais n'envoie pas encore de push mobile.
- Comme en V18, un serveur TURN reste recommandé pour fiabiliser WebRTC sur tous
  les réseaux.
