GameMate Admin — Timed Sanctions V7

Ajouts :
- sélection du type de sanction ;
- durées rapides : 1 h / 6 h / 24 h / 3 j / 7 j / 30 j ;
- durée personnalisée en minutes / heures / jours ;
- ban temporaire avec expiration automatique ;
- ban permanent conservé ;
- bouton Débloquer sur toute sanction active ;
- déblocage immédiat via revoke_moderation_sanction.

Backend Supabase :
- apply_moderation_sanction accepte maintenant aussi une durée pour les bans ;
- ends_at est renseigné pour un ban temporaire ;
- le Companion V6 se débloque automatiquement à l'expiration ou après révocation.
