# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Development Server
```bash
bun run dev
```
This starts the Vite development server on port 5173 with HTTPS configuration. The app will automatically open at https://localhost:5173.

### Build
```bash
bun run build
```
Builds the application for production. This runs TypeScript compilation (`vue-tsc -b`) followed by Vite build.

### Preview
```bash
bun run preview
```
Previews the production build locally.

## Project Architecture

### Technology Stack
- **Frontend Framework**: Vue 3 with Composition API and TypeScript
- **Build Tool**: Vite (using rolldown-vite for faster builds)
- **Package Manager**: Bun
- **UI Framework**: Reka UI (Vue port of Radix UI) with Tailwind CSS v4
- **State Management**: Pinia with persistence
- **Routing**: Vue Router with guards and meta types
- **Form Validation**: Vee-validate with Zod schemas
- **Icons**: Lucide Vue Next

### Directory Structure
```
src/
├── components/          # Reusable components
│   ├── ui/             # Shadcn/ui components (extensive library)
│   └── *.vue          # App-specific components
├── views/              # Page components
├── routers/            # Router configuration with guards
│   ├── routes/         # Route definitions
│   ├── guard.ts        # Route guards
│   └── authorize.ts    # Authorization logic
├── stores/             # Pinia stores
├── utils/              # Utility functions and extensions
├── lib/                # Shared library code
└── assets/             # Static assets and CSS
```

### Key Architecture Patterns

#### Component System
- Uses shadcn/ui component library (extensive set of 40+ UI components)
- Components follow the `components.json` configuration for aliases
- UI components are in TypeScript with proper prop typing

#### State Management
- Pinia stores with `pinia-plugin-persistedstate` for data persistence
- Store modules should be exported from `src/stores/index.ts`

#### Routing
- Type-safe routing with custom `RouteParam` and `RouteMeta` interfaces
- Route guards for authentication and authorization
- Page transition animations based on navigation direction
- Routes are defined in `src/routers/routes/index.ts` with typed exports

#### Styling
- Tailwind CSS v4 with CSS variables and zinc base color
- Custom animations for page transitions (slide-left, slide-right, fade)
- Component-specific styles in `<style scoped>` blocks

### Important Configuration Details

#### Database Configuration
- @schema.sql

#### HTTPS Development
The Vite config includes custom HTTPS setup that:
- Uses mkcert on non-Windows systems
- Attempts to use .NET dev-certs on Windows
- Falls back to mkcert if .NET certs fail

#### Build Configuration
- Outputs to `./dist/{mode}` directory based on build mode
- Uses TypeScript with strict configuration
- Path aliases: `@/*` maps to `./src/*`

#### Development Notes
- The app appears to be a couple's expense tracking application
- Features expense listing, spending items, and drawer-based forms
- Uses toast notifications via vue-sonner
- Implements responsive design with mobile-first approach

### TypeScript Configuration
The project uses composite TypeScript configuration:
- `tsconfig.json` - Main config with path aliases
- `tsconfig.app.json` - Application-specific settings
- `tsconfig.node.json` - Node.js tooling settings

All Vue components should use `<script setup lang="ts">` with proper TypeScript typing.