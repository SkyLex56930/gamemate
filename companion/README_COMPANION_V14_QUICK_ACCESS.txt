GameMate Companion V14 — Accès rapide
======================================

Cette archive est un correctif incrémental à appliquer par-dessus la V13.

Contenu de la V14
-----------------
- L’icône Amis de la barre supérieure utilise maintenant exactement le même pictogramme que l’entrée Amis de la navigation.
- La recherche supérieure ouvre un centre d’accès rapide moderne.
- Le centre s’ouvre aussi avec Ctrl+K (Cmd+K sur macOS).
- La recherche accepte le clavier : flèches haut/bas, Entrée et Échap.
- Les badges Amis, Messages et Support utilisent les compteurs réels de l’application.
- Lorsqu’un salon vocal est actif, l’accès rapide permet de revenir directement au bon salon.
- Toutes les entrées utilisent de vrais pictogrammes SVG, sans emoji.
- Aucun jeu de données fictif n’a été ajouté.

Installation
------------
1. Fermer GameMate Companion.
2. Copier le dossier companion de cette archive par-dessus le dossier companion de la V13.
3. Depuis le dossier companion, lancer :
   npm install
   npm run build
4. Pour tester l’application :
   npm run tauri dev

Base de données
---------------
Aucun script SQL supplémentaire n’est nécessaire pour la V14.
