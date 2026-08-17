# Portail paie

Application web qui structure les échanges entre le cabinet, les clients
employeurs et leurs salariés. Elle ne calcule pas la paie : elle gère la
collecte en amont (embauches, variables de paie) et la diffusion en aval
(bulletins), le logiciel de paie (Cegid) restant la source de vérité.

## Stack

- **Next.js** (App Router, TypeScript, Tailwind CSS) : web responsive
- **Supabase** (région UE) : Postgres + RLS, Auth, Storage privé
- **Brevo** : emails transactionnels (invitations, notifications, relances)
- `pdf-lib` + `pdfjs-dist` : découpage des PDF de bulletins
- `exceljs` : imports/exports Excel ; `jszip` : archives ZIP

## Les 4 profils

| Rôle | Accès |
|---|---|
| `admin_cabinet` | Tout, y compris équipe, audit, paramètres RGPD |
| `collaborateur` | Son portefeuille de dossiers |
| `client` | Uniquement son dossier et ses salariés |
| `salarie` | Uniquement ses propres bulletins et son solde de CP |

Le cloisonnement est garanti en base par les politiques RLS Postgres
(`supabase/migrations/0001_init.sql`), pas seulement par l'interface.

## Installation

### 1. Projet Supabase

1. Créez un projet sur [supabase.com](https://supabase.com) : **région UE**
   (Francfort `eu-central-1` ou Paris `eu-west-3`).
2. Dans le SQL Editor, exécutez le contenu de
   `supabase/migrations/0001_init.sql` (schéma, RLS, buckets).
3. Dans **Authentication → Emails**, configurez le SMTP Brevo (comme pour vos
   autres projets) pour les emails d'invitation.
4. Dans **Authentication → URL Configuration**, ajoutez
   `http://localhost:3000/auth/callback` (puis l'URL de production) aux
   Redirect URLs.

### 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Renseignez :

- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` (même page : serveur uniquement, jamais côté client)
- `NIR_ENCRYPTION_KEY` : `openssl rand -hex 32`
- `BREVO_API_KEY`, `EMAIL_FROM` (expéditeur validé dans Brevo)
- `CRON_SECRET` : `openssl rand -hex 24`

### 3. Premier administrateur

Invitez-vous depuis le dashboard Supabase (**Authentication → Users → Invite
user**), définissez votre mot de passe via le lien reçu, puis dans le SQL
Editor :

```sql
update public.profiles
set role = 'admin_cabinet', nom = 'VOTRE NOM', prenom = 'Prénom'
where email = 'vous@votre-cabinet.fr';
```

À la première connexion, l'application vous demandera d'activer la double
authentification (obligatoire pour le cabinet). Ensuite, tout se fait depuis
l'interface : équipe, dossiers, invitations clients et salariés.

### 4. Lancer

```bash
npm install
npm run dev
```

## Cycle mensuel

1. **Cabinet → Campagnes** : ouverture des campagnes du mois (date limite,
   notification des clients, relances automatiques quotidiennes via cron).
2. **Client** : « paies identiques ? » → OUI : terminé. NON : saisie salarié
   par salarié (net direct / variables avec calendrier d'absences / rien à
   signaler). **L'envoi est bloqué tant qu'un salarié n'est pas complété.**
3. **Envoi** : verrouillage, récap PDF, notification du collaborateur, export
   Excel des variables pour intégration dans Cegid.
4. **Cabinet → Bulletins** : dépôt du PDF global Cegid → découpage automatique
   par salarié (frontières variables), écran de contrôle de l'appariement,
   extraction des soldes de CP, publication (client + espace salarié + ZIP).

## Crons (Vercel)

`vercel.json` déclare deux crons ; définissez `CRON_SECRET` dans les variables
d'environnement Vercel (l'en-tête `Authorization: Bearer` est envoyé
automatiquement) :

- `/api/cron/relances` (8h00) : relances des campagnes en retard
- `/api/cron/retention` (2h30) : purge RGPD selon les durées paramétrées

## RGPD / sécurité

- NIR chiffré en AES-256-GCM (clé hors base), stocké dans une table sans
  aucune politique d'accès (service role uniquement), consultations
  journalisées.
- Pièces d'identité dans un bucket privé, téléchargements journalisés.
- Durées de conservation paramétrables (Paramètres) avec purge automatique.
- Droit d'opposition du salarié au bulletin dématérialisé (Paramètres de
  l'espace salarié) : le cabinet est notifié.
- Réversibilité : export ZIP complet par dossier (données JSON + documents +
  bulletins), réservé à l'administrateur et journalisé.

## Calibrage du découpage Cegid

L'appariement des bulletins se fait par matricule (prioritaire) puis
nom/prénom, et l'extraction des soldes CP par heuristique
(`src/lib/pdf-bulletins.ts` → `extraireSoldeCp`). Fournissez 2-3 PDF réels
anonymisés (avec bulletins de 1 et plusieurs pages) pour affiner ces règles ;
en attendant, l'écran de contrôle permet toujours la correction manuelle.
