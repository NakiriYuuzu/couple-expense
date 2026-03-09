-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Updated: 2026-03-08 (Phase 5: couple -> family domain rename)

CREATE TABLE public.families (
                                id uuid NOT NULL DEFAULT gen_random_uuid(),
                                name text NOT NULL DEFAULT '我們的家庭'::text,
                                invitation_code text UNIQUE,
                                is_active boolean DEFAULT true,
                                created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                CONSTRAINT families_pkey PRIMARY KEY (id)
);
CREATE TABLE public.family_settings (
                                        id uuid NOT NULL DEFAULT gen_random_uuid(),
                                        family_id uuid NOT NULL UNIQUE,
                                        monthly_budget numeric DEFAULT 30000,
                                        budget_start_day integer DEFAULT 1 CHECK (budget_start_day >= 1 AND budget_start_day <= 28),
                                        category_budgets jsonb DEFAULT '{}'::jsonb,
                                        currency text DEFAULT 'TWD'::text CHECK (currency = ANY (ARRAY['TWD'::text, 'USD'::text, 'EUR'::text, 'JPY'::text, 'CNY'::text])),
                                        custom_categories jsonb DEFAULT '[]'::jsonb,
                                        created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                        updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                        CONSTRAINT family_settings_pkey PRIMARY KEY (id),
                                        CONSTRAINT family_settings_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id)
);
CREATE TABLE public.expenses (
                                 id uuid NOT NULL DEFAULT gen_random_uuid(),
                                 user_id uuid NOT NULL,
                                 title text NOT NULL,
                                 amount numeric NOT NULL,
                                 category text NOT NULL,
                                 icon text,
                                 date date NOT NULL DEFAULT CURRENT_DATE,
                                 created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                 updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                 CONSTRAINT expenses_pkey PRIMARY KEY (id),
                                 CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_profiles (
                                      id uuid NOT NULL,
                                      email text,
                                      display_name text,
                                      avatar_url text,
                                      family_id uuid,
                                      role text DEFAULT 'member'::text CHECK (role = ANY (ARRAY['owner'::text, 'member'::text])),
                                      created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                      updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                      CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
                                      CONSTRAINT user_profiles_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id),
                                      CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_settings (
                                      id uuid NOT NULL DEFAULT gen_random_uuid(),
                                      user_id uuid NOT NULL UNIQUE,
                                      language text DEFAULT 'zh-TW'::text CHECK (language = ANY (ARRAY['zh-TW'::text, 'en'::text])),
                                      theme text DEFAULT 'system'::text CHECK (theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])),
                                      show_in_statistics boolean DEFAULT true,
                                      created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                      updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
                                      CONSTRAINT user_settings_pkey PRIMARY KEY (id),
                                      CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
