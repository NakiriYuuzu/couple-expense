# Family Expense

React 19 rewrite of the shared household expense tracker. The app supports personal expenses, group expense splitting, settlements, recurring expenses, push notifications, PWA offline/install behavior, and monthly reports backed by Supabase.

## Tech Stack

| Area | Current choice |
|---|---|
| Runtime / package manager | Bun |
| UI | React 19, React DOM 19 |
| Build | Vite 8 beta with Rolldown output options |
| Routing | TanStack Router file routes |
| Server state | TanStack Query |
| Client state | Zustand |
| UI components | shadcn/ui-style React components, Radix UI, Vaul, lucide-react |
| Styling | Tailwind CSS v4, `@tailwindcss/vite` |
| PWA | `vite-plugin-pwa` with `injectManifest`, custom `src/sw.ts` |
| Push | Firebase Messaging, Supabase Edge Function `send-push` |
| Backend | Supabase Auth, Postgres schema `group_expense`, RLS, Edge Functions |
| Testing | Vitest, happy-dom, React Testing Library |

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Create local env values from [.env.sample](./.env.sample):

```env
VITE_APP_TITLE=記帳寶App
VITE_APP_ROUTER_BASE=

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

`VITE_FIREBASE_VAPID_KEY` comes from Firebase Console Web Push certificates. Supabase Edge Function secrets for FCM service accounts are documented in [docs/fcm-setup.md](./docs/fcm-setup.md).

3. Start the dev server:

```bash
bun run dev
```

## Commands

| Command | Purpose |
|---|---|
| `bun run dev` | Start Vite dev server |
| `bun run build` | Build production assets into `dist/production` |
| `bun run typecheck` | Run `tsc -b` |
| `bun run test` | Run Vitest once |
| `bun run test:watch` | Run Vitest in watch mode |
| `bun run preview` | Preview the built app |

## Deployment

GitHub Pages deployment uses the production Vite mode, copies `dist/production/index.html` to `dist/production/404.html` for SPA deep-link fallback, and publishes `dist/production` to `gh-pages`.

See [docs/github-pages-deployment.md](./docs/github-pages-deployment.md) for required GitHub Secrets, release-trigger behavior, and troubleshooting.

## Source Layout

```text
src/
├── components/ui/          # shadcn/ui-style primitives
├── entities/               # cross-feature domain types
├── features/
│   ├── auth/               # auth stores, guards, account switching
│   ├── expense/            # expense queries, mutations, forms, list rows
│   ├── group/              # group queries and mutations
│   ├── notification/       # FCM registration and notification prefs
│   ├── report/             # monthly report data hooks and helpers
│   ├── settlement/         # debt and settlement hooks/components
│   ├── split/              # split calculation UI and logic
│   ├── statistics/         # statistics selectors and charts
│   └── user/               # profile and budget hooks
├── pages/                  # route page components
├── routes/                 # TanStack Router file routes
├── shared/
│   ├── components/         # app shell/shared widgets
│   ├── hooks/              # shared React hooks
│   ├── i18n/               # i18n setup and locales
│   ├── lib/                # Supabase, query keys, datetime, money, theme
│   └── stores/             # Zustand session/UI stores
├── styles/                 # global styles
├── main.tsx                # React entrypoint
└── sw.ts                   # custom PWA and FCM service worker
```

Database architecture is summarized in [docs/architecture.md](./docs/architecture.md) and the ERD is in [docs/db-diagram.md](./docs/db-diagram.md).

## Release Flow

Version changes require three synchronized artifacts:

1. Bump `package.json` `version`.
2. Add a matching entry to [CHANGELOG.md](./CHANGELOG.md) and keep `src/shared/changelog.ts` mirrored.
3. After review, create a matching `v*` git tag and GitHub Release.

Do not tag, publish a release, or push without explicit user approval.
