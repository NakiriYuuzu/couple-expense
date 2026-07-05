/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string
    readonly VITE_APP_ROUTER_BASE: string
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_FIREBASE_API_KEY: string
    readonly VITE_FIREBASE_AUTH_DOMAIN: string
    readonly VITE_FIREBASE_PROJECT_ID: string
    readonly VITE_FIREBASE_STORAGE_BUCKET: string
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
    readonly VITE_FIREBASE_APP_ID: string
    readonly VITE_FIREBASE_VAPID_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
