# Lacsamana–Ortega Family Archive v17

Deployment guide: [README-DEPLOY.md](README-DEPLOY.md).

Important: the shared family tree row is public-readable when published. Review and remove private details about living relatives before deployment. Never commit `.env.local` or place a Supabase secret key in Vercel.

Run `npm run check` for static validation. Run `npm run dev` after installing and logging into the Vercel CLI.


V15 added invited family-contributor accounts, moderated submissions, private contribution attachments, a digital family museum, evidence-aware migration stories, and migration/museum sections in the printable family legacy book. See README-DEPLOY.md and run supabase/migrations/002_family_contributions.sql in an existing V14 Supabase project.


## Version 16 — Regal Obsidian UI/UX

This update refines the visual system across the family tree and all archive sections with a restrained obsidian-black, warm-ivory, and champagne-brass palette. It adds display typography, clearer section hierarchy, improved form and button states, refined profile and sign-in overlays, stronger mobile layouts, and subtle motion.

Interaction improvements include keyboard-accessible profile and sign-in dialogs, Escape-to-close behavior, focus restoration, search-result arrow-key navigation, active archive-section navigation, a reading progress indicator, and a back-to-top control. The family data, Supabase schema, contribution permissions, and seed records are unchanged. No database migration or re-seed is required for this UI-only update.


## V17 · Family Research Center and Interactive Timeline

See `README-DEPLOY.md` for the one-time Supabase upgrade instructions. For an existing V16 Supabase database, run `supabase/migrations/003_family_research_center.sql` once. Existing genealogy seed data is unchanged; do not reseed. Static checks pass with `npm run check`; a live Supabase/browser upload test still needs to be performed after deployment.
