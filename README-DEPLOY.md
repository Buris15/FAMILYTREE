LACSAMANA × ORTEGA FAMILY ARCHIVE — VERCEL + SUPABASE v14
=========================================================

WHAT THIS DEPLOYMENT PACKAGE DOES
---------------------------------
- Hosts the existing HTML/CSS/JavaScript family archive on Vercel.
- Stores the base genealogy (182 person profiles, 51 unions, and 19 family-index groups) in Supabase Postgres.
- Uses Supabase Postgres for shared family-tree edits and archive-note synchronization.
- Uses Supabase Auth for administrator sign-in.
- Enforces database permissions with Row Level Security (RLS).
- Keeps the public website read-only for visitors.
- Keeps custom archive notes private by default until an administrator deliberately publishes them.
- Preserves the existing localStorage / IndexedDB fallback and CARTO Voyager Leaflet map.

IMPORTANT LIMITATION / PRIVACY WARNING
--------------------------------------
The base family tree is deliberately published through a public-readable Supabase row so visitors can browse it without signing in. That means names, relationships, dates, biography notes, and every other field in `baseData` can be retrieved by a visitor who knows how to inspect browser network requests or the Supabase Data API. RLS protects writes, not confidentiality of the published row.

Before making the site public, review living people's names, exact birth dates (including Sheryll's supplied birth date), family relationships, photos, and other personal details. Get permission from living relatives, or remove / anonymize information they have not agreed to publish. Do not rely on hidden UI, a login button, or `noindex` to protect data that is in the public `family_tree_state` row. If you need different visibility for living and deceased people, the schema and application must be redesigned to store private fields separately from the public tree before launch.

WHAT IS STORED IN SUPABASE
--------------------------
1. family_tree_state: JSON containing the base genealogy dataset plus shared tree edits (name/role overrides and people added through the edit/import workflow). The base genealogy is seeded once from supabase/seed-family-data.json. This row is published by default so public visitors receive the same shared tree. Only allowlisted administrators can write it.
2. family_archive_state: custom stories, achievements, property leads, source links, institutions, life-story notes, and ancestral-home notes. It is private by default. An administrator can publish it after reviewing the content.
3. The static built-in genealogy, timeline, map places, and source bibliography remain in the website files in this version.

Uploaded files selected through the existing archive forms are still stored in the browser's IndexedDB, not Supabase Storage. They do not automatically synchronize between devices in this version. For cloud-configured public visitors, browser-local private document and portrait uploads are hidden; authorized administrators can view them in the browser that uploaded them. The original images packaged in public/assets are included in the Vercel deployment. A separate Supabase Storage migration is needed for newly uploaded family photos/documents to be shared across devices.

REQUIREMENTS
------------
- Node.js 18 or newer (20 LTS recommended; the seed script uses the built-in fetch API).
- A GitHub account (recommended for Vercel deployment).
- A Vercel account.
- A Supabase account and project.
- Node.js LTS installed on Windows.
- Git installed (or upload the folder to GitHub using the website).

STEP 1 — CREATE THE SUPABASE DATABASE
-------------------------------------
1. Open https://supabase.com/dashboard and create a new project.
2. Choose a strong database password and save it privately.
3. Wait until the database is ready.
4. Open SQL Editor in the Supabase project.
5. Open supabase/schema.sql from this project, copy all of it, and run it.
6. Open Project Settings > API Keys (or the API settings page).
7. Copy the Project URL.
8. Copy the publishable key (usually starts with `sb_publishable_`). Older projects may expose an `anon` key; it can be used as the public client key when RLS is configured. NEVER use the `service_role` or `sb_secret_` key in the website.

STEP 1B — SEED THE BASE FAMILY DATA INTO SUPABASE
-------------------------------------------------
The public website now loads its 182 base person profiles, 51 union / parent-child groups, and 19 family-index groups from the database. The seed file stays outside public/ and is not included in the Vercel static output.

1. On your computer, create a local file named .env.local in the project root.
2. Add these lines, using your own Supabase project values:

   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_YOUR_SUPABASE_SECRET_KEY

3. Find the Secret key (`sb_secret_...`) in Supabase Project Settings > API Keys. Use it ONLY in this local `.env.local` file to run the one-time seed script. New `sb_secret_...` keys are opaque API keys, not JWTs; the seed script sends them using the `apikey` header. If you use an older `service_role` JWT instead, set `SUPABASE_SERVICE_ROLE_KEY` (the script supports both formats). Never paste either secret into chat, GitHub, website code, or Vercel browser-facing environment variables.
4. Open VS Code terminal in the project root and run:

   npm run seed

5. The script should report 182 people, 51 unions, and 19 family-index groups uploaded.
6. Confirm the row exists in Supabase Table Editor > family_tree_state.

The .gitignore excludes .env.local. Keep your GitHub repository private during setup. The Supabase secret is used only by this local seeding script and is never returned by api/config.js or loaded in the browser.

STEP 2 — CREATE YOUR ADMINISTRATOR ACCOUNT
------------------------------------------
1. In Supabase, open Authentication > Users.
2. Add a user with your own email and a strong password. Prefer creating users from the dashboard/invitation flow rather than enabling unrestricted public registration.
3. Copy the user's UUID from the Users list.
4. Open SQL Editor and run this statement with the actual UUID:

   insert into public.family_admins (user_id)
   values ('PASTE-YOUR-AUTH-USER-UUID-HERE');

5. Keep public sign-ups disabled. Only users manually added to family_admins can edit.
6. In Authentication > URL Configuration, set the Site URL to your eventual Vercel domain, for example https://your-project.vercel.app. Add the same domain and your local Vercel development callback URL to the allowed redirect URLs if needed.

STEP 3 — ADD SUPABASE SETTINGS TO VERCEL
----------------------------------------
The API function api/config.js returns only the Supabase project URL and publishable key. These are intended for browser use; RLS policies protect the data.

Set these environment variables in Vercel:

SUPABASE_URL = https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY = sb_publishable_YOUR_KEY

Do not add `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to Vercel. The browser must never receive a secret key.

In Vercel Dashboard:
1. Add a new project and import your GitHub repository.
2. Set the Root Directory to the project root.
3. Vercel uses public/ as the static output directory and api/config.js as a serverless function (vercel.json is already included).
4. Add the two environment variables above for Preview and Production.
5. Deploy.

Vercel's Git integration automatically creates preview deployments for branches and production deployments for the production branch (usually main).

STEP 4 — PUT THE CODE ON GITHUB
-------------------------------
Option A — GitHub website:
1. Create a new private repository first while preparing the archive.
2. Extract this ZIP.
3. Upload the contents of the extracted project folder (not the ZIP itself) into the repository.
4. Confirm that public/, api/, supabase/, package.json, and vercel.json are at the repository root.
5. Do not upload `.env.local` or any password / Supabase secret / service-role key.

Option B — Git commands in VS Code terminal:

   git init
   git add .
   git commit -m "Prepare family archive for Vercel and Supabase"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main

Then import that repository in Vercel.

STEP 5 — TEST LOCALLY
---------------------
Open the extracted folder in VS Code terminal and run:

   npm install
   npm install --global vercel
   vercel login
   vercel dev

Open the localhost URL printed by Vercel. The /api/config function works under vercel dev; opening index.html by double-clicking or using a plain static Live Server will not run that API route.

Test these items:
- The public site loads without signing in.
- The cloud status reports public view.
- Public visitor cannot see archive entry forms or remove controls.
- Admin can sign in with the allowlisted Supabase account.
- Admin can click Sync browser and approve the upload of this browser's current tree edits and archive notes.
- Refresh the page and check that the shared tree edits return from Supabase.
- Sign out and verify that editing controls disappear.
- Try an unauthorized account and verify it cannot access admin writes.

STEP 6 — FIRST CLOUD SYNC
-------------------------
After the database is configured and your admin account is allowlisted:
1. Open the deployed site (or vercel dev local site).
2. Sign in using the administrator account.
3. If you have existing localStorage edits or archive notes in this same browser origin, click Sync browser and confirm.
4. This uploads the current browser's tree edits and archive notes to the two Supabase state rows.
5. Future edits made while signed in are automatically synchronized after a short debounce.

IMPORTANT: localStorage is origin-specific. If you made changes on a different localhost URL or file:// origin, export them from that old copy first. Import tree edits with Import edits. Import archive notes with Import archive notes. Then sign in and click Sync browser.

PUBLICATION OF CUSTOM ARCHIVE NOTES
-----------------------------------
Custom archive notes are private by default. To publish them after reviewing their content, run:

   update public.family_archive_state set is_published = true where id = 'main';

To make them private again:

   update public.family_archive_state set is_published = false where id = 'main';

This publishes the whole custom archive-state payload, not individual entries. Review it first.

CARTO MAP KEY
-------------
The CARTO Voyager raster URL is used in script.js because the map library is Leaflet. CARTO keys are browser-visible; restrict the key to your Vercel domain in the CARTO dashboard and add localhost only while testing. Do not treat a browser map key as a server secret.

BACKUPS
-------
- Use Export edits and Export archive notes before major changes.
- Keep copies of original images and the project ZIP.
- Supabase database backups and retention depend on your Supabase plan; do not assume the free tier provides downloadable database backups or point-in-time recovery.
- Store the Git repository in a private repository until the public-data review is complete.

SECURITY MODEL
--------------
- Visitors: read the base public site and published shared tree edits.
- Authenticated family administrators: read/write shared tree edits and private archive notes.
- Other authenticated accounts: no write access unless their UUID is added to family_admins.
- Supabase publishable/anon key: browser visible; safe only because RLS and least-privilege grants are enabled.
- Secret / service-role key: never use in frontend, public files, GitHub, or Vercel public client environment. The local seed script accepts the current `sb_secret_...` format or a legacy `service_role` JWT.

TROUBLESHOOTING
---------------
"Cloud: database not configured": check Vercel environment variables and redeploy.
"This account is not on the family administrators allowlist": run the INSERT into family_admins using that Auth user's UUID.
"relation does not exist": run supabase/schema.sql in the correct Supabase project.
"permission denied" / RLS error: verify that the admin user is in family_admins and that schema.sql policies ran successfully.
"Cloud save failed": the browser retains its local copy; export it before refreshing, then check the Supabase table policies and browser console.
Map tiles missing: check CARTO domain restrictions and add the Vercel domain to the allowed referrers.

"No rows returned" / 401 from the Supabase Data API: check that the public schema's Data API access is enabled, `family_tree_state` and `family_archive_state` are exposed to the Data API, the schema grants and RLS policies ran, and the `main` family_tree_state row was seeded.

PROJECT STRUCTURE
-----------------
public/index.html       Existing family tree page
public/styles.css       Existing black theme and UI
public/script.js        Existing interactions; loads base genealogy from Supabase before rendering
public/database.js      Supabase login, base-data loading, cloud saving
public/assets/          Original portraits, documents and thumbnails
api/config.js           Vercel function exposing only public Supabase config
supabase/schema.sql     Database tables, RLS policies and admin allowlist
supabase/seed-family-data.json  Base genealogy dataset, kept outside Vercel public output
scripts/seed-supabase.js One-time local upload of base data using a local-only service key
vercel.json             Static output and security headers
package.json            Local Vercel and seed commands
.env.example            Environment variable names and placeholders

This v14 package prepares the app for Vercel and Supabase. It includes the base genealogy as a seed file and the one-time local seeding script. It does not create a Supabase project, set Vercel environment variables, create your administrator account, run the seed against your account, or deploy to your accounts. Those steps must be completed in your own dashboards and terminal.


V15 — FAMILY CONTRIBUTIONS AND LEGACY PRESENTATION
=================================================

This update adds:
- An invite-only family contribution portal. Relatives can submit missing-person leads, relationship corrections, historical records, photographs, documents, biographies, migration/place stories, and oral-history material.
- A moderation queue. Submissions remain private and pending until an administrator reviews them. Admins can approve privately, approve and publish (only when the contributor requested public display), or reject.
- A private Supabase Storage bucket for contribution attachments (JPG, PNG, WebP, PDF; max 15 MB). Attachments are not public; administrators and the submitting contributor receive short-lived signed links.
- A Digital Family Museum with curated exhibits using the supplied images and profile links. Captions preserve image-provenance cautions.
- A Family Migration and Place Stories section built from person-linked geography events. It shows recorded place associations, not assumed travel routes, and supports administrator-added sourced narratives.
- New optional sections in the family legacy book for migration stories and museum exhibits. The existing family-story / oral-history collection remains available.

UPGRADE AN EXISTING V14 SUPABASE PROJECT
----------------------------------------
1. Open Supabase Dashboard > SQL Editor.
2. Open `supabase/migrations/002_family_contributions.sql` from this project.
3. Copy the entire file and run it once in the same Supabase project used by V14.
4. Confirm that `family_contributors`, `family_contributions`, and the private `family-contribution-files` storage bucket exist.
5. Do NOT run `npm run seed` again for this feature update. The 182 base people, 51 unions, and 19 family-index groups are unchanged.

INVITE FAMILY CONTRIBUTORS
--------------------------
Public sign-ups remain disabled. Only people you deliberately invite can submit contributions.

For each relative you want to allow to contribute:
1. In Supabase Dashboard > Authentication > Users, click Invite user and enter their email address.
2. Let them complete the invitation and set their own password. Do not ask them to send you their password.
3. Copy their Auth user UUID from Authentication > Users.
4. In Supabase SQL Editor, run the following, replacing the UUID and display name:

   insert into public.family_contributors (user_id, display_name)
   values ('AUTH-USER-UUID-HERE', 'Relative display name')
   on conflict (user_id) do update set display_name = excluded.display_name;

5. The relative visits the deployed site, clicks “Family / admin sign in”, and signs in using their own email and password.
6. Their account can submit contributions and see only its own submissions. It cannot edit the official family tree, review other submissions, or access other contributors' private attachments.

Keep your existing administrator UUID in `family_admins`. Administrators can edit the official family tree and review every submission.

HOW CONTRIBUTION REVIEW WORKS
-----------------------------
- Every submission starts as `pending` and private.
- Anonymous visitors query only the `family_public_contributions` view, which exposes approved public text/source fields and omits contributor identity, admin notes, and private attachment paths.
- Contributors can request public display, but that request does not publish anything by itself.
- An administrator reviews the evidence and any living-person privacy/permission issues.
- “Approve privately” stores the approved submission without public display.
- “Approve & publish” is available only when the contributor requested public display. It requires an administrator confirmation and makes the contribution visible in the public portal and Digital Family Museum.
- Rejected submissions are not public.
- Approved contributions never alter parent-child or spouse relationships automatically. An administrator must verify evidence and update the official tree separately.

DEPLOY THE V15 CODE
-------------------
After running the SQL migration:

   git add .
   git commit -m "Add family contribution portal and digital museum"
   git push origin main

Vercel should create a new deployment from the `main` branch. Existing environment variables remain unchanged:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Do not add `SUPABASE_SECRET_KEY` to Vercel. The V15 browser client uses the publishable key and relies on RLS policies.

The Digital Family Museum, migration stories, existing oral-history area, and printable family legacy book are part of the website. Newly contributed content is not public unless an administrator approves it for public display. Original admin-only archive notes retain their existing private/published setting.
