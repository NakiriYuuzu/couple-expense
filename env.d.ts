/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string
    readonly VITE_APP_API_BASE: string
    readonly VITE_APP_ROUTER_BASE: string
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
