# Brevo + Supabase : emails Portail Paie / ETIK Paie

Trois types d’emails, **deux canaux** :

| Email | Qui l’envoie | Config |
|---|---|---|
| Invitation (admin, collab, client, salarié) | **API Brevo** via `generateLink` + `token_hash` | `BREVO_API_KEY` + `EMAIL_FROM` + `NEXT_PUBLIC_APP_URL` |
| Mot de passe oublié | **API Brevo** (`/api/auth/mot-de-passe-oublie`) | Lien `token_hash` (web + deep link mobile) |
| Confirmation / bienvenue à l’inscription | **API Brevo** (app Next.js) | `BREVO_API_KEY` + `EMAIL_FROM` dans `.env.local` |
| Notifications in-app (campagnes, etc.) | **API Brevo** | Idem `.env.local` |

Les invitations ne passent **plus** par `inviteUserByEmail` (mail Supabase) : le lien pointe directement vers `/definir-mot-de-passe?token_hash=…&type=invite`, ce qui évite la perte des tokens dans le fragment `#…` après redirection.

---

## 1. Côté Brevo

1. Compte : [https://app.brevo.com](https://app.brevo.com)
2. **Senders, Domains & Dedicated IPs** → ajoutez et **vérifiez** un domaine (ou au minimum un expéditeur email).
3. Notez une adresse d’envoi, ex. `paie@votre-domaine.fr` ou `noreply@…`.
4. **SMTP & API** :
   - **API key** → créez une clé (pour l’app Next.js) → `xkeysib-…`
   - **SMTP** → relevez :
     - Host : `smtp-relay.brevo.com`
     - Port : `587`
     - Login : (login SMTP affiché, souvent un email)
     - Mot de passe : **clé SMTP** (différente de l’API key)

---

## 2. Variables app (`.env.local` du projet `portail-paie`)

```env
BREVO_API_KEY=xkeysib-xxxxxxxx
EMAIL_FROM=paie@votre-domaine.fr
EMAIL_FROM_NAME=ETIK Paie
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

En production, `NEXT_PUBLIC_APP_URL` = URL publique du site (liens dans les mails).

### App mobile : mot de passe oublié

L’écran « Mot de passe oublié » appelle `POST /api/auth/mot-de-passe-oublie` avec
`redirect_to` = deep link (`etikpaie://auth/callback` ou URL Expo Go).
L’email contient un lien `token_hash` qui rouvre l’app sur l’écran de nouveau mot de passe.

Sur un **build natif**, le schéma `etikpaie://` (défini dans `app.json`) doit être
installé. Sous **Expo Go**, le lien utilise `exp://…/--/auth/callback`.

Redémarrez `npm run dev` après modification.

---

## 3. SMTP personnalisé sur Supabase (invitations + reset)

Dashboard : projet **yyhropmaztlxgttqaiph** → **Authentication** → **Emails** / **SMTP settings** :

| Champ | Valeur |
|---|---|
| Enable custom SMTP | Oui |
| Sender email | même que `EMAIL_FROM` (vérifié Brevo) |
| Sender name | `ETIK Paie` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | login SMTP Brevo |
| Password | clé SMTP Brevo |

Puis **Authentication → Rate Limits** : augmentez les plafonds d’emails (sinon plafonds bas même avec Brevo).

### Script optionnel (API Management)

```bash
# Token : https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN='sbp_…'
export PROJECT_REF=yyhropmaztlxgttqaiph
export SMTP_HOST=smtp-relay.brevo.com
export SMTP_PORT=587
export SMTP_USER='votre-login-smtp-brevo'
export SMTP_PASS='votre-cle-smtp-brevo'
export SMTP_ADMIN_EMAIL='paie@votre-domaine.fr'
export SMTP_SENDER_NAME='ETIK Paie'
./scripts/supabase-smtp-patch.example.sh
```

---

## 4. Vérifications

1. **Reset** : `/mot-de-passe-oublie` → mail reçu (logs Brevo + Auth logs Supabase).
2. **Invitation** : cabinet → inviter un email de test.
3. **Inscription** : créer un compte → mail de bienvenue (API Brevo, logs Transactional).

---

## Dépannage

- Expéditeur non vérifié dans Brevo → refus d’envoi.
- SMTP non activé dans Supabase → invitations/reset silencieux ou erreur Auth.
- `BREVO_API_KEY` vide → warning `[email] BREVO_API_KEY absente` dans la console Next.
