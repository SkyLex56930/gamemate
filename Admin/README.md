# GameMate Admin V1

Panneau d’administration séparé du Companion, basé sur l’architecture GameMate déjà construite.

## Fonctions disponibles
- Connexion Supabase Auth.
- Vérification réelle des rôles `owner`, `admin`, `moderator`.
- Aucun `service_role` dans le frontend.
- Journal des actions administratives.
- Jeux : ajout/modification, logo, cover, bannière, description, genre, publication, crossplay, plateformes, rangs et rôles.
- Cosmétiques : ajout/modification, type, rareté, méthode d’obtention, prix futur, style JSON, activation.
- Objectifs : ajout/modification, cible, récompense cosmétique, ordre et activation.
- Staff : réservé au `owner`, ajout/activation/désactivation des admins et modérateurs.
- Journal : 200 dernières actions.

## Prévu ensuite
- Outils de modération joueurs, signalements et sanctions.
- Communautés et permissions avancées.
- Boutique et paiement réel.
- MFA obligatoire pour les comptes sensibles.
- Statistiques avancées.

## Installation
1. Copie `.env.example` en `.env`.
2. Mets la clé publique/publishable du projet dans `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `npm install`
4. `npm run dev`

Port prévu : `1430`.

## Premier compte owner
Par sécurité, aucun compte n’est promu automatiquement.

Après avoir créé ou identifié ton compte admin dans Supabase Auth, récupère son UUID et exécute une seule fois dans l’éditeur SQL Supabase :

```sql
insert into public.admin_users(user_id, role, is_active)
values ('UUID_DU_COMPTE_ADMIN', 'owner', true);
```

Une fois connecté avec ce compte, la section **Équipe admin** permet de gérer les autres admins et modérateurs.

## Important
N’utilise jamais la clé `service_role` dans ce projet frontend.


## V2 — Espace Modération

Ajouté dans cette version :
- présence réelle séparée du Companion avec `admin_presence`;
- heartbeat toutes les 30 secondes;
- hors ligne automatique si le heartbeat devient trop ancien;
- statut manuel En ligne / Occupé;
- liste réelle owner/admin/moderator;
- salon Général créé côté backend;
- création de salons internes par owner/admin;
- gestion des membres des salons;
- chat interne réel via `moderation_messages`;
- realtime sur présence, salons et messages;
- journal des créations/suppressions/modifications de salons et membres;
- aucun faux modérateur connecté et aucun faux message.

Le rôle `moderator` peut utiliser les salons auxquels il a accès, mais ne peut pas administrer la structure des salons.


## V3 — Centre de modération premium

Cette version reprend un design proche de la maquette envoyée :
- grand dashboard de modération ;
- cartes KPI ;
- file de signalements filtrable ;
- panneau de détail complet du signalement ;
- boutons d’actions rapides (ignorer, avertir, mute, suspendre, bannir) ;
- tickets support ;
- salle d’incident branchée sur les salons internes de modération ;
- journal d’activité admin branché sur `admin_audit_log` ;
- liste du staff avec présence réelle.

Notes :
- la présence staff, les salons internes et les messages sont connectés au backend existant ;
- la file de signalements/tickets est préparée côté UI dans cette V3 pour coller à la maquette ;
- la prochaine étape logique sera de brancher ces cartes à de vraies tables `reports`, `tickets`, `sanctions`, `appeals`.


## V5 — Support réel Companion → Admin

Ajout du backend et de l'interface de traitement pour :
- tickets support réels ;
- conversation joueur ↔ support ;
- statut et priorité ;
- réponse du staff ;
- signalements utilisateurs ;
- statut et priorité des signalements ;
- realtime.

La page **Support** de l'Admin lit directement :
- `support_tickets`
- `support_ticket_messages`
- `user_reports`

Le Mode test du Companion peut donc créer une vraie demande avec un compte standard, puis l'Admin peut la traiter.


## V6 — Modération 100% réelle

La page Modération n'utilise plus aucune donnée seed/fictive.

Sources réelles :
- `user_reports`
- `moderation_sanctions`
- `support_tickets`
- `admin_presence`
- `moderation_channels`
- `moderation_messages`
- `admin_audit_log`
- `profiles`

Actions réelles :
- changer statut/priorité d'un signalement ;
- ignorer un signalement ;
- avertissement ;
- mute 24h ;
- suspension 7 jours ;
- bannissement ;
- historique des sanctions ;
- révocation par Owner/Admin ;
- présence staff ;
- salle d'incident ;
- journal d'activité.

Note :
les sanctions sont maintenant réellement enregistrées en base.
L'application globale devra ensuite lire ces sanctions pour appliquer partout les effets produit
(ex : empêcher l'envoi de messages pendant un mute ou bloquer l'accès après un ban).
