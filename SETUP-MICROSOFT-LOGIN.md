# Microsoft sign-in and hub.egpromo.com: setup

The code is already in the repo and does nothing until step 4. Do the steps in order. Plan on about
30 to 45 minutes, most of it in the Microsoft Entra admin center.

You need:
- Admin access to the DNS for egpromo.com (wherever the domain's DNS is hosted)
- Owner access to the Vercel project `eg-project-hub`
- An Entra admin (Global Admin or Application Admin) in **each** of the two Microsoft tenants

---

## 1. Point hub.egpromo.com at Vercel

1. Vercel → `eg-project-hub` → **Settings → Domains → Add** → type `hub.egpromo.com` → Add.
   Vercel shows the DNS record it wants. It's usually:

   | Type  | Name | Value                  |
   |-------|------|------------------------|
   | CNAME | hub  | cname.vercel-dns.com   |

   Use whatever value Vercel shows you if it's different.
2. Add that record at egpromo.com's DNS host. Don't touch the existing `@` / `www` records: the main
   website stays where it is.
3. Wait for Vercel to show **Valid Configuration** (usually a few minutes). It sets up HTTPS on its own.

The old `eg-project-hub.vercel.app` address keeps working. Once sign-in is on, it forwards to
hub.egpromo.com automatically.

## 2. Register the hub with Microsoft (in your main tenant)

Entra admin center (entra.microsoft.com) → **Entra ID → App registrations → New registration**

- **Name:** Eagle Graphics Hub
- **Supported account types:** *Multiple Entra ID tenants*.
  This is what lets the second company sign in. The hub itself only lets in the two tenants you
  list in step 4; everyone else gets a "not from an Eagle Graphics company" page.
- **Redirect URI:** platform **Web**, `https://hub.egpromo.com/api/auth/callback`

Click Register, then:

1. **Overview:** copy the **Application (client) ID** and the **Directory (tenant) ID**.
2. **Authentication:** add two more Web redirect URIs:
   - `https://eg-project-hub.vercel.app/api/auth/callback`
   - The test (preview) address for this change plus `/api/auth/callback`. Copy the address from
     the Vercel bot's comment on the pull request; it looks like
     `https://eg-project-hub-git-microsoft-login-....vercel.app`. Remove it after merging.
   Leave "Access tokens" and "ID tokens" under Implicit grant **unchecked**.
3. **Certificates & secrets → New client secret** → 24 months → copy the **Value** right away
   (it's only shown once). Put a calendar reminder a few weeks before it expires.
4. **App roles → Create app role**, once per role. For each:
   - Allowed member types: **Users/Groups**
   - Value: lowercase, no spaces (this is what goes in projects.json)

   Two roles:

   | Display name | Value   | Sees                                                  |
   |--------------|---------|-------------------------------------------------------|
   | Admin        | admin   | Everything, including locked tools                    |
   | Manager      | manager | The regular hub plus cards marked `"roles": ["manager"]` |

   Anyone signed in with no role still sees every card that has no `roles` on it.

## 3. Give out Admin and Manager

Entra → **Entra ID → Enterprise apps → All applications → Eagle Graphics Hub** (or search "Enterprise apps" in the top bar)

1. **Properties → Assignment required?** Leave it at **No**. Everyone with a company Microsoft account
   can sign in and sees the regular hub. New hires get in automatically; people who leave lose access
   when their account is turned off.
2. **Users and groups → Add user/group** → pick the people who get **Admin** or **Manager** → pick the
   role → Assign. Nobody else needs to be added.
   Assigning a whole group needs Entra ID P1 (included in Microsoft 365 Business Premium). Without it,
   assign people one at a time.

### The second tenant

A Global Admin of the second tenant opens this link while signed in to that tenant (put your
Application (client) ID in it):

```
https://login.microsoftonline.com/organizations/adminconsent?client_id=YOUR-CLIENT-ID
```

They approve it. "Eagle Graphics Hub" then shows up in **their** Enterprise applications, and they repeat
step 3 there (assign their admins and managers). The roles from step 2 show up there
automatically.

Also copy the second tenant's **Tenant ID** (Entra → Overview).

## 4. Turn it on in Vercel

Vercel → `eg-project-hub` → **Settings → Environment Variables**. Add these for **Production** and
**Preview**:

| Name                  | Value                                                          |
|-----------------------|----------------------------------------------------------------|
| `AUTH_CLIENT_ID`      | Application (client) ID from step 2                            |
| `AUTH_CLIENT_SECRET`  | Secret value from step 2 (mark it Sensitive)                   |
| `AUTH_TENANTS`        | `eg=FIRST-TENANT-ID,ef=SECOND-TENANT-ID` (short names are up to you) |
| `AUTH_SECRET`         | A long random string, 40+ characters (mark it Sensitive)       |
| `AUTH_CANONICAL_HOST` | `hub.egpromo.com` (Production only)                            |

To make `AUTH_SECRET`, run this in PowerShell and paste the result:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

The short names in `AUTH_TENANTS` become roles too: `"roles": ["tenant:ef"]` shows a card only to
people from that company.

Environment variables only take effect on the next deploy: **Deployments → latest → ⋯ → Redeploy**.

## 5. Test

1. Open the preview address for this change in a private window. You should land on Microsoft's
   sign-in, then back on the hub with your name and **Sign Out** in the top right.
2. Try someone from the second company.
3. Try someone with no role. They get in and see the regular hub, without manager or admin tools.
4. Merge the pull request, then check `https://hub.egpromo.com`.

## Turning it off

Delete `AUTH_CLIENT_ID` in Vercel and redeploy. The hub goes back to being open to anyone with the link.

## Limiting cards by role

In `site/projects.json`, on a card or a whole section:

```json
"roles": ["sales", "manager"]
```

That card is hidden from the hub **and** its URL is blocked for everyone without one of those roles.
A card's own `roles` replace its section's. `admin` always sees everything. External apps (full
`https://` URLs on another site) are only hidden from the list; they need their own sign-in to be locked.

## When something goes wrong

| Message                                              | Fix                                                         |
|------------------------------------------------------|-------------------------------------------------------------|
| "Sign-in isn't set up correctly yet: ..."            | An environment variable is missing; the page says which.   |
| "redirect URI mismatch"                              | Add that address's `/api/auth/callback` in step 2.2.        |
| "haven't been given access"                          | Someone turned Assignment required on. Set it back to No.  |
| "administrator needs to approve"                     | Second tenant hasn't done the admin consent link yet.      |
| "isn't from an Eagle Graphics company"               | Their tenant ID isn't in `AUTH_TENANTS`.                   |
| "client secret is wrong or expired"                  | Make a new secret (step 2.3), update Vercel, redeploy.     |

People stay signed in for 12 hours, then Microsoft signs them back in quietly.
