# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file mirrors `src/shared/changelog.ts`; update both places in the same release change.

## [2.0.0] - 2026-07-05

### Changed

- Fully rewrote the app as a React 19 frontend with TanStack Router, TanStack Query, Zustand, shadcn/ui-style components, and Tailwind CSS v4.
- Aligned the React rewrite with the Vue-era visual behavior and core expense workflows.
- Enhanced Settings with inline profile editing, personal budget management, multi-account management, logout confirmation, and version information.
- Reduced initial JS bundle size (gzip) by ~27% (244 KiB → 178 KiB) compared with the Vue build.
- Added expense list virtualization.
- Added background update prompts for newer app versions.
- Unified the currency display format as `NT 1,234` (space-separated, no dollar sign) across the app.

### Added

- Added push notifications for new split assignments, received settlements, and monthly report publication.
- Added notification preference toggles backed by `user_settings.notification_prefs`.
- Added PWA offline/install behavior through `vite-plugin-pwa` `injectManifest` and the custom service worker.
- Added monthly reports, including the monthly report page, Dashboard entry point near month start, and Settings history list.
- Added cross-device preference sync: theme and language persist to `user_settings` and follow the account.

## [1.0.0] - 2025-12-02

### Added

- Introduced the v2 group-expense model: groups, members, group settings, expense splits, settlements, monthly debt snapshots, and group RPCs.
- Added recurring expenses, background data preload, pull-to-refresh, PWA manifest/offline cache, and GitHub Pages deployment support.
- Added personal expense tracking, multi-account management, dark mode, and account switching.
- Added Firebase/Supabase environment support and GitHub Pages SPA fallback.

### Changed

- Refactored the Vue app toward a feature-based structure.
- Iterated expense, dashboard, group, settlement, and statistics pages through the v2 waves.
- Updated app icon, cleanup docs, and deployment workflow structure.

### Fixed

- Completed the June 2026 audit repair series: auth cleanup, guard fail-safe behavior, NT$/i18n consistency, recurring expense off-by-one behavior, split conservation, integer TWD debt suggestions, settlement cache invalidation, and startup route fixes.
- Fixed GitHub Pages OAuth redirects, Firebase service worker path issues, CSP/404 fallback behavior, and workflow typecheck problems.
- Fixed drawer/popover mobile interaction and expense form ordering issues in the 1.3.x series.

### Security

- Added branch protection expectations around the CI quality gate and deployment check.
- Documented and applied backend hardening work for search_path, legacy public RPC access, and Supabase platform follow-ups.
