# GitHub Pages Deployment

The deployment workflow is [.github/workflows/deploy-gh-pages.yml](../.github/workflows/deploy-gh-pages.yml). It builds the React app with Bun and publishes `dist/production` to the `gh-pages` branch.

## Current Flow

The workflow runs on:

- push to `main`
- pull request to `main` for build verification
- published GitHub Release
- manual `workflow_dispatch`

Build behavior:

1. `bun install --frozen-lockfile`
2. `bun run build`
3. Vite production mode writes to `dist/production`
4. `dist/production/index.html` is copied to `dist/production/404.html`
5. non-PR events deploy `dist/production` to `gh-pages`

The `404.html` copy is required because TanStack Router uses SPA deep links. GitHub Pages serves `404.html` for unknown paths, allowing routes such as `/reports/2026-06` to boot the app.

## Required GitHub Secrets

Configure these in repository Settings -> Secrets and variables -> Actions.

| Secret | Build env name | Required for |
|---|---|---|
| `VITE_SUPABASE_URL` | `VITE_SUPABASE_URL` | Supabase client |
| `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | Supabase client |
| `VITE_APP_TITLE` | `VITE_APP_TITLE` | App title |
| `VITE_APP_API_BASE` | `VITE_APP_API_BASE` | Optional app API base if used by deployment |
| `VITE_FIREBASE_API_KEY` | `VITE_FIREBASE_API_KEY` | Firebase Web SDK |
| `VITE_FIREBASE_AUTH_DOMAIN` | `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web SDK |
| `VITE_FIREBASE_PROJECT_ID` | `VITE_FIREBASE_PROJECT_ID` | Firebase Web SDK and Messaging |
| `VITE_FIREBASE_STORAGE_BUCKET` | `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Web SDK |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging |
| `VITE_FIREBASE_APP_ID` | `VITE_FIREBASE_APP_ID` | Firebase Web SDK |
| `VITE_FIREBASE_VAPID_KEY` | `VITE_FIREBASE_VAPID_KEY` | Web Push `getToken` |

The sample local variable names are listed in [.env.sample](../.env.sample). Firebase service account secrets are not frontend build secrets; set them on Supabase Edge Functions as described in [docs/fcm-setup.md](./fcm-setup.md).

The Firebase `VITE_FIREBASE_*` secrets must be created in GitHub repository Settings -> Secrets and variables -> Actions. If they are not set, the deployed app automatically disables push notifications while the rest of the app continues to work.

## Base Path

The workflow sets:

```text
VITE_APP_ROUTER_BASE=/${{ github.event.repository.name }}/
```

Vite uses this as `base`, so assets and service worker scope are generated for the repository subpath.

## Release Deployment

Release deployment is intentionally user-approved:

1. Bump `package.json` version.
2. Update [CHANGELOG.md](../CHANGELOG.md) and `src/shared/changelog.ts`.
3. After review, create tag `v*`.
4. Publish the GitHub Release.
5. The release event deploys to GitHub Pages.

Do not create tags or releases without explicit user approval.

## Local Check

```bash
bun run build
ls dist/production/index.html
cp dist/production/index.html dist/production/404.html
bun run preview
```

## Troubleshooting

- Missing Supabase env values make `src/shared/lib/supabase.ts` throw during app startup.
- Missing Firebase frontend values disable messaging setup but should not break the PWA shell.
- If deep links 404 after deploy, confirm `dist/production/404.html` exists in the published branch.
- If assets fail to load, confirm `VITE_APP_ROUTER_BASE` matches the repository path on GitHub Pages.
