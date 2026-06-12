# Setup Guide

This walks through the one-time setup needed to run Tempo Calendar locally and deploy it. The most common reason the **"Couldn't open the Google sign-in window"** error appears in dev is that the current origin isn't listed under **Authorized JavaScript origins** on your Google OAuth Client ID — see step 3 below.

---

## 1. Supabase

1. Create a project at https://supabase.com/dashboard
2. Open **SQL Editor** and run the three migration files in order:
   - `supabase/migrations/001_create_tasks.sql`
   - `supabase/migrations/002_delete_old_habits.sql`
   - `supabase/migrations/003_add_task_lists_scheduling_profiles.sql`
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

---

## 2. Google Cloud Console — create the OAuth Client ID

1. Go to https://console.cloud.google.com/
2. Create a new project (or select an existing one).
3. **Enable the Google Calendar API**:
   - APIs & Services → Library → search "Google Calendar API" → Enable.
4. **Configure the OAuth consent screen** (required before you can create credentials):
   - APIs & Services → OAuth consent screen
   - User type: **External** (or **Internal** if you're on Google Workspace)
   - Fill in the required app name, support email, and developer contact
   - Add the scopes:
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
   - Add your email as a test user while the app is in "Testing" mode
5. **Create the OAuth 2.0 Client ID**:
   - APIs & Services → Credentials → **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: anything (e.g. "Tempo Calendar")
   - **Authorized JavaScript origins** — see step 3 below
   - **Authorized redirect URIs** — leave empty (GIS uses popup flow, not redirect)
   - Click Create
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) → `VITE_GOOGLE_CLIENT_ID`

---

## 3. Google Cloud Console — add Authorized JavaScript origins ⚠️

This is the most common cause of the **"Couldn't open the Google sign-in window"** error. GIS will refuse to open the popup if the current page origin isn't whitelisted here.

Open **APIs & Services → Credentials → click your OAuth 2.0 Client ID** and add to **Authorized JavaScript origins**:

| Environment | Origin to add |
|---|---|
| Local dev (Vite default) | `http://localhost:5173` |
| Local dev (alt port) | `http://localhost:5174` (and any other port Vite might fall back to) |
| Vercel preview deployments | `https://*-<your-team>.vercel.app` (wildcard subdomain) |
| Vercel production | `https://<your-app>.vercel.app` |
| Custom domain | `https://yourdomain.com` and `https://www.yourdomain.com` |

**Important:**
- **No trailing slash.** Use `http://localhost:5173`, not `http://localhost:5173/`.
- **Include both http and https** for localhost if you switch between them.
- Changes can take **a few minutes to a few hours** to propagate.

The Tempo Calendar app surfaces the **exact current origin** in the error banner when this misconfiguration is detected, with a one-click **Copy origin** button to paste into the Console.

---

## 4. Environment variables

Create `.env` in the project root (it's gitignored):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

---

## 5. Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Sign in**.

---

## Troubleshooting

### "Couldn't open the Google sign-in window"
- **Most common cause:** the current origin isn't in **Authorized JavaScript origins** — see step 3. The app shows the exact origin and a one-click link to fix it.
- **Other causes:** browser popup blocker, ad-blocker, or the page is in an iframe.
- **Still stuck?** Open browser DevTools → Console — look for `GoogleIdentityServicesError` with a `type` field:
  - `popup_failed_to_open` → origin not authorized (most common)
  - `popup_closed` → user dismissed the popup
  - `unknown_risk_level` → page is in an iframe or sandboxed context
  - `access_denied` → user declined consent

### "Failed to load Google Identity Services"
- Network is blocking `https://accounts.google.com/gsi/client` (corporate firewall, VPN, ad-blocker). Try a different network or disable the blocker for this domain.

### "Missing Google Client ID" / "Missing VITE_SUPABASE_URL"
- `.env` is missing the variable, or the dev server wasn't restarted after editing it. Vite reads `.env` on startup — kill and re-run `npm run dev` after changes.

### Silent auth fails (no popup appears) but consent popup works
- Normal. Silent auth (`prompt: ''`) only works if the user has previously granted consent in the current browser session. After the first consent, reload and silent auth should succeed.
